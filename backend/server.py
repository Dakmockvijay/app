import os
import uuid
import hmac
import hashlib
import logging
import secrets
from io import BytesIO
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any, Annotated

import httpx
import bcrypt
import pandas as pd
from fastapi import FastAPI, APIRouter, HTTPException, Header, UploadFile, File, Form, Depends
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pydantic import BaseModel, Field, EmailStr, BeforeValidator, ConfigDict

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="DakMock API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("dakmock")

EMERGENT_AUTH_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"


def now() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


# ----------------------------- Models ---------------------------------------
PyObjectId = Annotated[str, BeforeValidator(str)]


class RegisterIn(BaseModel):
    name: str
    email: EmailStr
    password: str
    referral_code: Optional[str] = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class SessionIn(BaseModel):
    session_id: str


class OrderIn(BaseModel):
    plan: str  # "single" | "combo"
    category_id: Optional[str] = None


class VerifyIn(BaseModel):
    local_order_id: str
    razorpay_payment_id: str = "mock_payment"
    razorpay_order_id: str = "mock_order"
    razorpay_signature: str = "mock"


class AttemptIn(BaseModel):
    answers: Dict[str, int] = {}  # question index (str) -> selected option index
    time_taken_sec: int = 0
    mode: str = "exam"  # exam | practice


class GoalIn(BaseModel):
    daily_goal: int


class PayoutIn(BaseModel):
    method: str  # upi | paytm | gpay
    account: str


class SupportIn(BaseModel):
    subject: str
    message: str


class PricingIn(BaseModel):
    single_price: int
    combo_price: int


class RazorpaySettingsIn(BaseModel):
    enabled: bool = False
    key_id: str = ""
    key_secret: str = ""
    mode: str = "test"


class SupportConfigIn(BaseModel):
    support_email: str


class SeriesIn(BaseModel):
    title: str
    category_id: str
    description: str = ""
    is_free: bool = False


class QuestionIn(BaseModel):
    question_en: str
    question_hi: str = ""
    options_en: List[str]
    options_hi: List[str] = []
    correct_index: int
    explanation_en: str = ""
    explanation_hi: str = ""
    marks: float = 1.0


class TestIn(BaseModel):
    series_id: str
    title: str
    duration_min: int = 30
    questions: List[QuestionIn] = []


class AnnouncementIn(BaseModel):
    title: str
    message: str
    active: bool = True


class SeriesUpdateIn(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    is_free: Optional[bool] = None
    category_id: Optional[str] = None


class AdminTestIn(BaseModel):
    series_id: str
    title: str
    duration_min: int = 30
    paper: str = ""
    questions: List[QuestionIn] = []


class AdminTestUpdateIn(BaseModel):
    title: Optional[str] = None
    duration_min: Optional[int] = None
    paper: Optional[str] = None
    questions: Optional[List[QuestionIn]] = None


class GrantSubIn(BaseModel):
    plan: str  # single | combo
    category_id: Optional[str] = None
    days: int = 365


class UserUpdateIn(BaseModel):
    is_admin: Optional[bool] = None
    token_balance: Optional[int] = None


class ReferralConfigIn(BaseModel):
    referral_enabled: bool
    tokens_per_referral: int
    token_value: int
    payout_threshold: int


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str


class PolicyIn(BaseModel):
    terms: Optional[str] = None
    refund: Optional[str] = None
    privacy: Optional[str] = None


class EnsureSeriesIn(BaseModel):
    category_id: str
    is_free: bool
    series_type: str = "mock"  # mock | pyq


# ----------------------------- Helpers ---------------------------------------
def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_pw(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def gen_referral_code() -> str:
    return "DAK" + secrets.token_hex(3).upper()


async def create_session(user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    await db.user_sessions.insert_one({
        "session_token": token,
        "user_id": user_id,
        "created_at": now(),
        "expires_at": now() + timedelta(days=7),
    })
    return token


def public_user(u: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "user_id": u["user_id"],
        "name": u.get("name", ""),
        "email": u.get("email", ""),
        "picture": u.get("picture"),
        "referral_code": u.get("referral_code"),
        "token_balance": u.get("token_balance", 0),
        "is_admin": u.get("is_admin", False),
        "daily_goal": u.get("daily_goal", 3),
        "created_at": iso(u.get("created_at", now())),
    }


async def get_current_user(authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.split(" ", 1)[1]
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    exp = session.get("expires_at")
    if exp and exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp and exp < now():
        raise HTTPException(status_code=401, detail="Session expired")
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


async def require_admin(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


async def get_settings() -> Dict[str, Any]:
    s = await db.settings.find_one({"_id": "app"})
    if not s:
        s = {
            "_id": "app",
            "single_price": 149,
            "combo_price": 249,
            "support_email": "support@dakmock.com",
            "razorpay": {"enabled": False, "key_id": "", "key_secret": "", "mode": "test"},
            "token_value": 10,
            "payout_threshold": 10,
            "referral_enabled": True,
            "tokens_per_referral": 1,
        }
        await db.settings.insert_one(s)
    s.setdefault("referral_enabled", True)
    s.setdefault("tokens_per_referral", 1)
    return s


async def active_subscriptions(user_id: str) -> List[Dict[str, Any]]:
    subs = await db.subscriptions.find(
        {"user_id": user_id, "active": True}, {"_id": 0}
    ).to_list(100)
    out = []
    for s in subs:
        au = s.get("active_until")
        if au and au.tzinfo is None:
            au = au.replace(tzinfo=timezone.utc)
        if au and au > now():
            out.append(s)
    return out


async def has_access(user_id: str, category_id: str) -> bool:
    for s in await active_subscriptions(user_id):
        if s["plan"] == "combo" or s.get("category_id") == category_id:
            return True
    return False


async def ensure_series(category_id: str, is_free: bool, series_type: str) -> str:
    """Find or create the single 'bucket' series for a (category, free/paid, type) combo."""
    series_type = (series_type or "mock").lower()
    existing = await db.test_series.find_one({
        "category_id": category_id, "is_free": is_free,
        "series_type": series_type, "is_bucket": True, "deleted_at": None,
    })
    if existing:
        return existing["series_id"]
    cat = await db.categories.find_one({"category_id": category_id}, {"_id": 0})
    cat_name = cat["name"] if cat else category_id
    title = f"{cat_name} · {'Free' if is_free else 'Paid'} · {series_type.upper()}"
    sid = f"series_{uuid.uuid4().hex[:10]}"
    await db.test_series.insert_one({
        "series_id": sid, "title": title, "category_id": category_id,
        "description": f"{series_type.upper()} tests", "is_free": is_free,
        "series_type": series_type, "is_bucket": True, "deleted_at": None, "created_at": now(),
    })
    return sid


# ----------------------------- Auth routes -----------------------------------
@api.get("/")
async def root():
    return {"message": "DakMock API"}


@api.post("/auth/register")
async def register(body: RegisterIn):
    existing = await db.users.find_one({"email": body.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    referrer = None
    if body.referral_code:
        referrer = await db.users.find_one({"referral_code": body.referral_code.upper().strip()})
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    doc = {
        "user_id": user_id,
        "name": body.name,
        "email": body.email.lower(),
        "password": hash_pw(body.password),
        "picture": None,
        "referral_code": gen_referral_code(),
        "referred_by": referrer["user_id"] if referrer else None,
        "token_balance": 0,
        "has_purchased": False,
        "is_admin": False,
        "auth_provider": "email",
        "created_at": now(),
    }
    await db.users.insert_one(doc)
    token = await create_session(user_id)
    return {"session_token": token, "user": public_user(doc)}


@api.post("/auth/login")
async def login(body: LoginIn):
    user = await db.users.find_one({"email": body.email.lower()})
    if not user or not user.get("password") or not verify_pw(body.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = await create_session(user["user_id"])
    return {"session_token": token, "user": public_user(user)}


@api.post("/auth/session")
async def google_session(body: SessionIn):
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(EMERGENT_AUTH_URL, headers={"X-Session-ID": body.session_id})
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session")
    data = r.json()
    email = data.get("email", "").lower()
    user = await db.users.find_one({"email": email})
    if not user:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        user = {
            "user_id": user_id,
            "name": data.get("name", email.split("@")[0]),
            "email": email,
            "password": None,
            "picture": data.get("picture"),
            "referral_code": gen_referral_code(),
            "referred_by": None,
            "token_balance": 0,
            "has_purchased": False,
            "is_admin": False,
            "auth_provider": "google",
            "created_at": now(),
        }
        await db.users.insert_one(user)
    token = await create_session(user["user_id"])
    return {"session_token": token, "user": public_user(user)}


@api.get("/auth/me")
async def me(user: Dict[str, Any] = Depends(get_current_user)):
    return public_user(user)


@api.post("/auth/logout")
async def logout(authorization: Optional[str] = Header(default=None)):
    if authorization and authorization.startswith("Bearer "):
        await db.user_sessions.delete_one({"session_token": authorization.split(" ", 1)[1]})
    return {"ok": True}


# ----------------------------- Catalog ----------------------------------------
@api.get("/categories")
async def categories():
    cats = await db.categories.find({}, {"_id": 0}).to_list(100)
    return sorted(cats, key=lambda c: c.get("order", 0))


@api.get("/pricing")
async def pricing():
    s = await get_settings()
    return {"single_price": s["single_price"], "combo_price": s["combo_price"]}


@api.get("/test-series")
async def list_series(user: Dict[str, Any] = Depends(get_current_user)):
    series = await db.test_series.find({"deleted_at": None}, {"_id": 0}).to_list(500)
    result = []
    for s in series:
        access = s.get("is_free") or await has_access(user["user_id"], s["category_id"])
        test_count = await db.tests.count_documents({"series_id": s["series_id"], "deleted_at": None})
        result.append({**s, "purchased": access, "test_count": test_count})
    return result


@api.get("/test-series/{series_id}/tests")
async def series_tests(series_id: str, user: Dict[str, Any] = Depends(get_current_user)):
    series = await db.test_series.find_one({"series_id": series_id}, {"_id": 0})
    if not series:
        raise HTTPException(status_code=404, detail="Series not found")
    access = series.get("is_free") or await has_access(user["user_id"], series["category_id"])
    tests = await db.tests.find({"series_id": series_id, "deleted_at": None}, {"_id": 0}).to_list(500)
    out = []
    for t in tests:
        attempt = await db.attempts.find_one(
            {"user_id": user["user_id"], "test_id": t["test_id"]},
            {"_id": 0}, sort=[("created_at", -1)],
        )
        out.append({
            "test_id": t["test_id"],
            "title": t["title"],
            "duration_min": t["duration_min"],
            "paper": t.get("paper", ""),
            "question_count": len(t.get("questions", [])),
            "total_marks": sum(q.get("marks", 1) for q in t.get("questions", [])),
            "attempted": attempt is not None,
            "last_attempt_id": attempt["attempt_id"] if attempt else None,
            "last_score": attempt["score"] if attempt else None,
        })
    return {"series": series, "access": access, "tests": out}


@api.get("/tests/{test_id}")
async def get_test(test_id: str, practice: bool = False, user: Dict[str, Any] = Depends(get_current_user)):
    t = await db.tests.find_one({"test_id": test_id}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Test not found")
    series = await db.test_series.find_one({"series_id": t["series_id"]}, {"_id": 0})
    access = series.get("is_free") or await has_access(user["user_id"], series["category_id"])
    if not access:
        raise HTTPException(status_code=403, detail="Purchase required to access this test")
    questions = []
    for i, q in enumerate(t.get("questions", [])):
        item = {
            "index": i,
            "question_en": q["question_en"],
            "question_hi": q.get("question_hi", ""),
            "options_en": q["options_en"],
            "options_hi": q.get("options_hi", []),
            "marks": q.get("marks", 1),
        }
        if practice:
            item["correct_index"] = q["correct_index"]
            item["explanation_en"] = q.get("explanation_en", "")
            item["explanation_hi"] = q.get("explanation_hi", "")
        questions.append(item)
    return {
        "test_id": t["test_id"],
        "title": t["title"],
        "duration_min": t["duration_min"],
        "questions": questions,
    }


@api.post("/tests/{test_id}/submit")
async def submit_test(test_id: str, body: AttemptIn, user: Dict[str, Any] = Depends(get_current_user)):
    t = await db.tests.find_one({"test_id": test_id}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Test not found")
    series = await db.test_series.find_one({"series_id": t["series_id"]}, {"_id": 0})
    access = series.get("is_free") or await has_access(user["user_id"], series["category_id"])
    if not access:
        raise HTTPException(status_code=403, detail="Purchase required")

    questions = t.get("questions", [])
    total_marks = sum(q.get("marks", 1) for q in questions)
    score = 0.0
    correct = wrong = unattempted = 0
    detail = []
    for i, q in enumerate(questions):
        sel = body.answers.get(str(i))
        is_correct = sel is not None and sel == q["correct_index"]
        if sel is None:
            unattempted += 1
        elif is_correct:
            correct += 1
            score += q.get("marks", 1)
        else:
            wrong += 1
        detail.append({
            "index": i,
            "question_en": q["question_en"],
            "question_hi": q.get("question_hi", ""),
            "options_en": q["options_en"],
            "options_hi": q.get("options_hi", []),
            "correct_index": q["correct_index"],
            "selected_index": sel,
            "is_correct": is_correct,
            "explanation_en": q.get("explanation_en", ""),
            "explanation_hi": q.get("explanation_hi", ""),
            "marks": q.get("marks", 1),
        })

    attempt_id = f"att_{uuid.uuid4().hex[:12]}"
    accuracy = round((correct / max(1, correct + wrong)) * 100, 1)
    doc = {
        "attempt_id": attempt_id,
        "user_id": user["user_id"],
        "test_id": test_id,
        "series_id": t["series_id"],
        "test_title": t["title"],
        "score": round(score, 2),
        "total_marks": total_marks,
        "correct": correct,
        "wrong": wrong,
        "unattempted": unattempted,
        "accuracy": accuracy,
        "time_taken_sec": body.time_taken_sec,
        "mode": body.mode,
        "answers": body.answers,
        "detail": detail,
        "created_at": now(),
    }
    await db.attempts.insert_one(doc)

    pipeline = [
        {"$match": {"test_id": test_id, "mode": {"$ne": "practice"}}},
        {"$sort": {"score": -1, "time_taken_sec": 1}},
        {"$group": {"_id": "$user_id", "best": {"$first": "$score"}}},
    ]
    bests = [b["best"] async for b in db.attempts.aggregate(pipeline)]
    bests.sort(reverse=True)
    total_users = len(bests)
    rank = 1 + sum(1 for b in bests if b > score)
    lower = sum(1 for b in bests if b < score)
    percentile = round((lower / max(1, total_users)) * 100, 1) if total_users else 100.0

    return {
        "attempt_id": attempt_id,
        "score": round(score, 2),
        "total_marks": total_marks,
        "rank": rank,
        "total_users": total_users,
        "percentile": percentile,
    }


@api.get("/attempts")
async def my_attempts(user: Dict[str, Any] = Depends(get_current_user)):
    atts = await db.attempts.find(
        {"user_id": user["user_id"]}, {"_id": 0, "detail": 0, "answers": 0}
    ).sort("created_at", -1).to_list(200)
    return [{**a, "created_at": iso(a["created_at"])} for a in atts]


@api.get("/attempts/{attempt_id}")
async def attempt_detail(attempt_id: str, user: Dict[str, Any] = Depends(get_current_user)):
    a = await db.attempts.find_one(
        {"attempt_id": attempt_id, "user_id": user["user_id"]}, {"_id": 0}
    )
    if not a:
        raise HTTPException(status_code=404, detail="Attempt not found")
    pipeline = [
        {"$match": {"test_id": a["test_id"], "mode": {"$ne": "practice"}}},
        {"$sort": {"score": -1, "time_taken_sec": 1}},
        {"$group": {"_id": "$user_id", "best": {"$first": "$score"}}},
    ]
    bests = [b["best"] async for b in db.attempts.aggregate(pipeline)]
    bests.sort(reverse=True)
    total_users = len(bests)
    rank = 1 + sum(1 for b in bests if b > a["score"])
    lower = sum(1 for b in bests if b < a["score"])
    percentile = round((lower / max(1, total_users)) * 100, 1) if total_users else 100.0
    a["created_at"] = iso(a["created_at"])
    return {**a, "rank": rank, "total_users": total_users, "percentile": percentile}


@api.get("/tests/{test_id}/leaderboard")
async def leaderboard(test_id: str, user: Dict[str, Any] = Depends(get_current_user)):
    pipeline = [
        {"$match": {"test_id": test_id, "mode": {"$ne": "practice"}}},
        {"$sort": {"score": -1, "time_taken_sec": 1}},
        {"$group": {"_id": "$user_id", "best": {"$first": "$score"},
                    "time": {"$first": "$time_taken_sec"}}},
        {"$sort": {"best": -1, "time": 1}},
        {"$limit": 50},
    ]
    rows = []
    rank = 0
    async for r in db.attempts.aggregate(pipeline):
        rank += 1
        u = await db.users.find_one({"user_id": r["_id"]}, {"_id": 0, "name": 1})
        rows.append({
            "rank": rank,
            "name": (u or {}).get("name", "Student"),
            "score": r["best"],
            "is_me": r["_id"] == user["user_id"],
        })
    return rows


# ----------------------------- Analytics / Streak / Goals --------------------
@api.post("/me/goal")
async def set_goal(body: GoalIn, user: Dict[str, Any] = Depends(get_current_user)):
    goal = max(1, min(50, int(body.daily_goal)))
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"daily_goal": goal}})
    return {"daily_goal": goal}


def _streak_from_days(day_set: set, today) -> Dict[str, int]:
    if not day_set:
        return {"current": 0, "longest": 0, "active_days": 0}
    days = sorted(day_set)
    # longest run of consecutive days
    longest = 1
    run = 1
    for i in range(1, len(days)):
        if (days[i] - days[i - 1]).days == 1:
            run += 1
            longest = max(longest, run)
        else:
            run = 1
    # current streak: counts back from today (or yesterday if nothing today)
    current = 0
    cursor = today
    if cursor not in day_set:
        cursor = today - timedelta(days=1)
    while cursor in day_set:
        current += 1
        cursor = cursor - timedelta(days=1)
    return {"current": current, "longest": longest, "active_days": len(day_set)}


@api.get("/analytics")
async def analytics(user: Dict[str, Any] = Depends(get_current_user)):
    atts = await db.attempts.find(
        {"user_id": user["user_id"]}, {"_id": 0, "detail": 0, "answers": 0}
    ).sort("created_at", 1).to_list(1000)

    # series_id -> category_id, category_id -> name
    series_rows = await db.test_series.find({}, {"_id": 0, "series_id": 1, "category_id": 1}).to_list(1000)
    s2c = {s["series_id"]: s.get("category_id") for s in series_rows}
    cat_rows = await db.categories.find({}, {"_id": 0}).to_list(100)
    c2name = {c["category_id"]: c.get("name", c.get("short", "Exam")) for c in cat_rows}

    total = len(atts)
    total_marks_sum = sum(a.get("total_marks", 0) for a in atts)
    score_sum = sum(a.get("score", 0) for a in atts)
    acc_sum = sum(a.get("accuracy", 0) for a in atts)
    time_sum = sum(a.get("time_taken_sec", 0) for a in atts)
    best_pct = 0.0
    cat_agg: Dict[str, Dict[str, float]] = {}
    day_set = set()
    trend = []

    for a in atts:
        tm = a.get("total_marks", 0) or 1
        pct = round((a.get("score", 0) / tm) * 100, 1)
        best_pct = max(best_pct, pct)
        created = a.get("created_at")
        if isinstance(created, datetime):
            day_set.add(created.date())
        cid = s2c.get(a.get("series_id"))
        if cid:
            d = cat_agg.setdefault(cid, {"attempts": 0, "acc": 0.0, "pct": 0.0})
            d["attempts"] += 1
            d["acc"] += a.get("accuracy", 0)
            d["pct"] += pct
        trend.append({
            "attempt_id": a.get("attempt_id"),
            "date": iso(created) if isinstance(created, datetime) else None,
            "title": a.get("test_title", ""),
            "accuracy": a.get("accuracy", 0),
            "score_pct": pct,
        })

    categories_out = []
    for cid, d in cat_agg.items():
        n = d["attempts"] or 1
        categories_out.append({
            "category_id": cid,
            "name": c2name.get(cid, "Exam"),
            "attempts": d["attempts"],
            "avg_accuracy": round(d["acc"] / n, 1),
            "avg_score_pct": round(d["pct"] / n, 1),
        })
    categories_out.sort(key=lambda x: x["avg_accuracy"], reverse=True)

    today = now().date()
    streak = _streak_from_days(day_set, today)
    today_count = sum(1 for a in atts if isinstance(a.get("created_at"), datetime) and a["created_at"].date() == today)
    goal = user.get("daily_goal", 3)

    return {
        "total_attempts": total,
        "avg_score_pct": round((score_sum / total_marks_sum) * 100, 1) if total_marks_sum else 0.0,
        "avg_accuracy": round(acc_sum / total, 1) if total else 0.0,
        "best_score_pct": round(best_pct, 1),
        "total_time_sec": time_sum,
        "categories": categories_out,
        "trend": trend[-15:],
        "streak": streak,
        "today": {"count": today_count, "goal": goal, "met": today_count >= goal},
    }


# ----------------------------- Subscriptions / Payments ----------------------
@api.get("/subscriptions")
async def my_subscriptions(user: Dict[str, Any] = Depends(get_current_user)):
    subs = await active_subscriptions(user["user_id"])
    out = []
    for s in subs:
        cat = await db.categories.find_one({"category_id": s.get("category_id")}, {"_id": 0}) if s.get("category_id") else None
        out.append({
            "plan": s["plan"],
            "category_id": s.get("category_id"),
            "category_name": cat["name"] if cat else "All Categories",
            "active_until": iso(s["active_until"]),
            "created_at": iso(s["created_at"]),
        })
    return out


@api.post("/payments/orders")
async def create_order(body: OrderIn, user: Dict[str, Any] = Depends(get_current_user)):
    s = await get_settings()
    if body.plan == "single":
        if not body.category_id:
            raise HTTPException(status_code=400, detail="category_id required for single plan")
        amount = s["single_price"] * 100
    elif body.plan == "combo":
        amount = s["combo_price"] * 100
    else:
        raise HTTPException(status_code=400, detail="Invalid plan")

    local_id = str(uuid.uuid4())
    rz = s.get("razorpay", {})
    configured = rz.get("enabled") and rz.get("key_id") and rz.get("key_secret")
    order = {
        "_id": local_id,
        "user_id": user["user_id"],
        "plan": body.plan,
        "category_id": body.category_id,
        "amount": amount,
        "currency": "INR",
        "status": "created",
        "mock": not configured,
        "created_at": now(),
    }
    if not configured:
        await db.payment_orders.insert_one(order)
        return {"mock": True, "local_order_id": local_id, "amount": amount,
                "currency": "INR", "key_id": None}
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post("https://api.razorpay.com/v1/orders",
                         json={"amount": amount, "currency": "INR",
                               "receipt": f"dak-{local_id}"[:40]},
                         auth=(rz["key_id"], rz["key_secret"]))
    if r.status_code >= 400:
        raise HTTPException(status_code=502, detail="Unable to create payment order")
    rzo = r.json()
    order.update({"razorpay_order_id": rzo["id"], "key_id": rz["key_id"]})
    await db.payment_orders.insert_one(order)
    return {"mock": False, "local_order_id": local_id, "order_id": rzo["id"],
            "amount": amount, "currency": "INR", "key_id": rz["key_id"]}


@api.post("/payments/verify")
async def verify_payment(body: VerifyIn, user: Dict[str, Any] = Depends(get_current_user)):
    order = await db.payment_orders.find_one({"_id": body.local_order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.get("status") == "paid":
        return {"ok": True, "status": "paid", "idempotent": True}
    if order.get("mock"):
        pass
    else:
        s = await get_settings()
        rz = s.get("razorpay", {})
        if body.razorpay_order_id != order.get("razorpay_order_id"):
            raise HTTPException(status_code=400, detail="Order mismatch")
        message = f'{order["razorpay_order_id"]}|{body.razorpay_payment_id}'
        expected = hmac.new(rz["key_secret"].encode(), message.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, body.razorpay_signature):
            raise HTTPException(status_code=400, detail="Invalid payment signature")

    await db.payment_orders.update_one(
        {"_id": order["_id"]},
        {"$set": {"status": "paid", "payment_id": body.razorpay_payment_id, "verified_at": now()}},
    )
    await db.subscriptions.insert_one({
        "subscription_id": f"sub_{uuid.uuid4().hex[:12]}",
        "user_id": order["user_id"],
        "plan": order["plan"],
        "category_id": order.get("category_id"),
        "payment_order_id": order["_id"],
        "active": True,
        "active_until": now() + timedelta(days=365),
        "created_at": now(),
    })
    buyer = await db.users.find_one({"user_id": order["user_id"]})
    if buyer and not buyer.get("has_purchased"):
        await db.users.update_one({"user_id": buyer["user_id"]}, {"$set": {"has_purchased": True}})
        settings = await get_settings()
        if buyer.get("referred_by") and settings.get("referral_enabled", True):
            tokens = int(settings.get("tokens_per_referral", 1))
            await db.users.update_one({"user_id": buyer["referred_by"]}, {"$inc": {"token_balance": tokens}})
            await db.referrals.insert_one({
                "referral_id": f"ref_{uuid.uuid4().hex[:12]}",
                "referrer_id": buyer["referred_by"],
                "referred_id": buyer["user_id"],
                "referred_name": buyer.get("name", ""),
                "tokens_awarded": tokens,
                "created_at": now(),
            })
    return {"ok": True, "status": "paid"}


# ----------------------------- Referral / Wallet -----------------------------
@api.get("/referral")
async def referral_dashboard(user: Dict[str, Any] = Depends(get_current_user)):
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    refs = await db.referrals.find({"referrer_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    s = await get_settings()
    return {
        "referral_code": fresh["referral_code"],
        "token_balance": fresh.get("token_balance", 0),
        "token_value": s.get("token_value", 10),
        "payout_threshold": s.get("payout_threshold", 10),
        "referrals": [{**r, "created_at": iso(r["created_at"])} for r in refs],
    }


@api.get("/payout-requests")
async def my_payouts(user: Dict[str, Any] = Depends(get_current_user)):
    reqs = await db.payout_requests.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return [{**r, "created_at": iso(r["created_at"])} for r in reqs]


@api.post("/payout-requests")
async def request_payout(body: PayoutIn, user: Dict[str, Any] = Depends(get_current_user)):
    fresh = await db.users.find_one({"user_id": user["user_id"]})
    s = await get_settings()
    threshold = s.get("payout_threshold", 10)
    balance = fresh.get("token_balance", 0)
    if balance < threshold:
        raise HTTPException(status_code=400, detail=f"Need at least {threshold} tokens to request payout")
    amount = balance * s.get("token_value", 10)
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"token_balance": 0}})
    doc = {
        "payout_id": f"pay_{uuid.uuid4().hex[:12]}",
        "user_id": user["user_id"],
        "user_name": fresh.get("name", ""),
        "method": body.method,
        "account": body.account,
        "tokens": balance,
        "amount": amount,
        "status": "pending",
        "created_at": now(),
    }
    await db.payout_requests.insert_one(doc)
    return {"ok": True, "payout_id": doc["payout_id"], "amount": amount}


# ----------------------------- Support ---------------------------------------
@api.get("/support-config")
async def support_config():
    s = await get_settings()
    return {"support_email": s.get("support_email", "support@dakmock.com")}


@api.post("/support-tickets")
async def create_ticket(body: SupportIn, user: Dict[str, Any] = Depends(get_current_user)):
    await db.support_tickets.insert_one({
        "ticket_id": f"tkt_{uuid.uuid4().hex[:12]}",
        "user_id": user["user_id"],
        "user_name": user.get("name", ""),
        "user_email": user.get("email", ""),
        "subject": body.subject,
        "message": body.message,
        "status": "open",
        "created_at": now(),
    })
    return {"ok": True}


# ----------------------------- Admin -----------------------------------------
@api.get("/admin/stats")
async def admin_stats(_: Dict[str, Any] = Depends(require_admin)):
    return {
        "users": await db.users.count_documents({}),
        "test_series": await db.test_series.count_documents({"deleted_at": None}),
        "tests": await db.tests.count_documents({"deleted_at": None}),
        "attempts": await db.attempts.count_documents({}),
        "pending_payouts": await db.payout_requests.count_documents({"status": "pending"}),
        "open_tickets": await db.support_tickets.count_documents({"status": "open"}),
        "active_subscriptions": await db.subscriptions.count_documents({"active": True}),
    }


@api.get("/admin/users")
async def admin_users(_: Dict[str, Any] = Depends(require_admin)):
    users = await db.users.find({}, {"_id": 0, "password": 0}).sort("created_at", -1).to_list(1000)
    out = []
    for u in users:
        subs = await active_subscriptions(u["user_id"])
        attempts = await db.attempts.count_documents({"user_id": u["user_id"]})
        out.append({
            **public_user(u),
            "referred_by": u.get("referred_by"),
            "active_subscriptions": len(subs),
            "attempts": attempts,
        })
    return out


@api.get("/admin/payout-requests")
async def admin_payouts(_: Dict[str, Any] = Depends(require_admin)):
    reqs = await db.payout_requests.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [{**r, "created_at": iso(r["created_at"])} for r in reqs]


@api.post("/admin/payout-requests/{payout_id}/action")
async def admin_payout_action(payout_id: str, action: str, _: Dict[str, Any] = Depends(require_admin)):
    req = await db.payout_requests.find_one({"payout_id": payout_id})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req["status"] != "pending":
        raise HTTPException(status_code=400, detail="Already processed")
    if action == "approve":
        await db.payout_requests.update_one({"payout_id": payout_id}, {"$set": {"status": "paid", "processed_at": now()}})
    elif action == "reject":
        await db.users.update_one({"user_id": req["user_id"]}, {"$inc": {"token_balance": req["tokens"]}})
        await db.payout_requests.update_one({"payout_id": payout_id}, {"$set": {"status": "rejected", "processed_at": now()}})
    else:
        raise HTTPException(status_code=400, detail="Invalid action")
    return {"ok": True}


@api.get("/admin/tickets")
async def admin_tickets(_: Dict[str, Any] = Depends(require_admin)):
    tks = await db.support_tickets.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [{**t, "created_at": iso(t["created_at"])} for t in tks]


@api.get("/admin/settings")
async def admin_get_settings(_: Dict[str, Any] = Depends(require_admin)):
    s = await get_settings()
    rz = s.get("razorpay", {})
    return {
        "single_price": s["single_price"],
        "combo_price": s["combo_price"],
        "support_email": s.get("support_email", ""),
        "referral_enabled": s.get("referral_enabled", True),
        "tokens_per_referral": s.get("tokens_per_referral", 1),
        "token_value": s.get("token_value", 10),
        "payout_threshold": s.get("payout_threshold", 10),
        "razorpay": {
            "enabled": rz.get("enabled", False),
            "key_id": rz.get("key_id", ""),
            "key_secret_set": bool(rz.get("key_secret")),
            "mode": rz.get("mode", "test"),
        },
    }


@api.put("/admin/pricing")
async def admin_pricing(body: PricingIn, _: Dict[str, Any] = Depends(require_admin)):
    await get_settings()
    await db.settings.update_one({"_id": "app"}, {"$set": {"single_price": body.single_price, "combo_price": body.combo_price}})
    return {"ok": True}


@api.put("/admin/razorpay")
async def admin_razorpay(body: RazorpaySettingsIn, _: Dict[str, Any] = Depends(require_admin)):
    await get_settings()
    update = {"razorpay.enabled": body.enabled, "razorpay.key_id": body.key_id, "razorpay.mode": body.mode}
    if body.key_secret:
        update["razorpay.key_secret"] = body.key_secret
    await db.settings.update_one({"_id": "app"}, {"$set": update})
    return {"ok": True}


@api.put("/admin/support-config")
async def admin_support_config(body: SupportConfigIn, _: Dict[str, Any] = Depends(require_admin)):
    await get_settings()
    await db.settings.update_one({"_id": "app"}, {"$set": {"support_email": body.support_email}})
    return {"ok": True}


@api.post("/admin/test-series")
async def admin_create_series(body: SeriesIn, _: Dict[str, Any] = Depends(require_admin)):
    sid = f"series_{uuid.uuid4().hex[:10]}"
    await db.test_series.insert_one({
        "series_id": sid, "title": body.title, "category_id": body.category_id,
        "description": body.description, "is_free": body.is_free,
        "deleted_at": None, "created_at": now(),
    })
    return {"ok": True, "series_id": sid}


@api.get("/admin/sample-template")
async def sample_template():
    df = pd.DataFrame([{
        "Question Text (EN)": "The GDS to MTS exam is conducted by?",
        "Question Text (HI)": "जीडीएस से एमटीएस परीक्षा किसके द्वारा आयोजित की जाती है?",
        "Option A (EN)": "India Post", "Option B (EN)": "SSC",
        "Option C (EN)": "UPSC", "Option D (EN)": "IBPS",
        "Option A (HI)": "इंडिया पोस्ट", "Option B (HI)": "एसएससी",
        "Option C (HI)": "यूपीएससी", "Option D (HI)": "आईबीपीएस",
        "Correct Answer": "A",
        "Explanation (EN)": "Departmental exams are conducted by India Post.",
        "Explanation (HI)": "विभागीय परीक्षाएं इंडिया पोस्ट द्वारा आयोजित की जाती हैं।",
        "Exam Category": "gds_mts", "Test Name": "GDS to MTS Mock Test 1",
        "Time Limit (min)": 30, "Marks": 1,
    }])
    buf = BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Questions")
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=dakmock_template.xlsx"},
    )


def _col(row, *names):
    for n in names:
        if n in row and pd.notna(row[n]):
            return str(row[n]).strip()
    return ""


@api.post("/admin/bulk-upload")
async def bulk_upload(file: UploadFile = File(...), _: Dict[str, Any] = Depends(require_admin)):
    content = await file.read()
    try:
        df = pd.read_excel(BytesIO(content), engine="openpyxl")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read Excel file: {e}")
    df = df.fillna("")
    letter_map = {"A": 0, "B": 1, "C": 2, "D": 3}
    grouped: Dict[str, Dict[str, Any]] = {}
    for _, row in df.iterrows():
        r = {k: row[k] for k in df.columns}
        test_name = _col(r, "Test Name", "Test", "test_name")
        category = _col(r, "Exam Category", "Category", "category") or "gds_mts"
        if not test_name:
            continue
        try:
            duration = int(float(_col(r, "Time Limit (min)", "Time Limit", "Duration") or 30))
        except Exception:
            duration = 30
        try:
            marks = float(_col(r, "Marks", "Mark") or 1)
        except Exception:
            marks = 1.0
        correct_raw = _col(r, "Correct Answer", "Answer", "Correct").upper()
        correct_index = letter_map.get(correct_raw, 0)
        if correct_raw.isdigit():
            correct_index = max(0, int(correct_raw) - 1)
        opts_en = [_col(r, "Option A (EN)", "Option A"), _col(r, "Option B (EN)", "Option B"),
                   _col(r, "Option C (EN)", "Option C"), _col(r, "Option D (EN)", "Option D")]
        opts_hi = [_col(r, "Option A (HI)"), _col(r, "Option B (HI)"),
                   _col(r, "Option C (HI)"), _col(r, "Option D (HI)")]
        q = {
            "question_en": _col(r, "Question Text (EN)", "Question Text", "Question"),
            "question_hi": _col(r, "Question Text (HI)"),
            "options_en": opts_en,
            "options_hi": opts_hi if any(opts_hi) else [],
            "correct_index": correct_index,
            "explanation_en": _col(r, "Explanation (EN)", "Explanation"),
            "explanation_hi": _col(r, "Explanation (HI)"),
            "marks": marks,
        }
        key = f"{category}|{test_name}"
        if key not in grouped:
            grouped[key] = {"category": category, "test_name": test_name, "duration": duration, "questions": []}
        grouped[key]["questions"].append(q)

    created_tests = 0
    created_questions = 0
    for key, g in grouped.items():
        series = await db.test_series.find_one({"category_id": g["category"], "is_bulk": True})
        if not series:
            sid = f"series_{uuid.uuid4().hex[:10]}"
            series = {"series_id": sid, "title": "Uploaded Tests",
                      "category_id": g["category"], "description": "Tests added via bulk upload",
                      "is_free": False, "is_bulk": True, "deleted_at": None, "created_at": now()}
            await db.test_series.insert_one(series)
        tid = f"test_{uuid.uuid4().hex[:10]}"
        await db.tests.insert_one({
            "test_id": tid, "series_id": series["series_id"], "title": g["test_name"],
            "duration_min": g["duration"], "questions": g["questions"],
            "deleted_at": None, "created_at": now(),
        })
        created_tests += 1
        created_questions += len(g["questions"])
    return {"ok": True, "tests_created": created_tests, "questions_created": created_questions}


# ----------------------------- Announcements --------------------------------
@api.get("/announcements/active")
async def active_announcement(_: Dict[str, Any] = Depends(get_current_user)):
    a = await db.announcements.find_one(
        {"active": True, "deleted_at": None}, {"_id": 0}, sort=[("created_at", -1)]
    )
    if not a:
        return None
    return {"announcement_id": a["announcement_id"], "title": a["title"],
            "message": a["message"], "created_at": iso(a["created_at"])}


@api.get("/admin/announcements")
async def admin_list_announcements(_: Dict[str, Any] = Depends(require_admin)):
    items = await db.announcements.find({"deleted_at": None}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return [{**a, "created_at": iso(a["created_at"])} for a in items]


@api.post("/admin/announcements")
async def admin_create_announcement(body: AnnouncementIn, _: Dict[str, Any] = Depends(require_admin)):
    aid = f"ann_{uuid.uuid4().hex[:10]}"
    await db.announcements.insert_one({
        "announcement_id": aid, "title": body.title, "message": body.message,
        "active": body.active, "deleted_at": None, "created_at": now(),
    })
    return {"ok": True, "announcement_id": aid}


@api.put("/admin/announcements/{aid}")
async def admin_update_announcement(aid: str, body: AnnouncementIn, _: Dict[str, Any] = Depends(require_admin)):
    await db.announcements.update_one(
        {"announcement_id": aid},
        {"$set": {"title": body.title, "message": body.message, "active": body.active}},
    )
    return {"ok": True}


@api.delete("/admin/announcements/{aid}")
async def admin_delete_announcement(aid: str, _: Dict[str, Any] = Depends(require_admin)):
    await db.announcements.update_one({"announcement_id": aid}, {"$set": {"deleted_at": now()}})
    return {"ok": True}


# ----------------------------- Admin: Series & Tests ------------------------
@api.get("/admin/test-series")
async def admin_list_series(_: Dict[str, Any] = Depends(require_admin)):
    series = await db.test_series.find({"deleted_at": None}, {"_id": 0}).to_list(500)
    out = []
    for s in series:
        cnt = await db.tests.count_documents({"series_id": s["series_id"], "deleted_at": None})
        cat = await db.categories.find_one({"category_id": s["category_id"]}, {"_id": 0})
        out.append({
            "series_id": s["series_id"], "title": s["title"], "description": s.get("description", ""),
            "category_id": s["category_id"], "category_name": cat["name"] if cat else s["category_id"],
            "is_free": s.get("is_free", False), "test_count": cnt,
        })
    return out


@api.put("/admin/test-series/{sid}")
async def admin_update_series(sid: str, body: SeriesUpdateIn, _: Dict[str, Any] = Depends(require_admin)):
    update = {k: v for k, v in body.dict().items() if v is not None}
    if update:
        await db.test_series.update_one({"series_id": sid}, {"$set": update})
    return {"ok": True}


@api.delete("/admin/test-series/{sid}")
async def admin_delete_series(sid: str, _: Dict[str, Any] = Depends(require_admin)):
    await db.test_series.update_one({"series_id": sid}, {"$set": {"deleted_at": now()}})
    await db.tests.update_many({"series_id": sid}, {"$set": {"deleted_at": now()}})
    return {"ok": True}


@api.get("/admin/test-series/{sid}/tests")
async def admin_series_tests(sid: str, _: Dict[str, Any] = Depends(require_admin)):
    tests = await db.tests.find({"series_id": sid, "deleted_at": None}, {"_id": 0}).to_list(500)
    return [{
        "test_id": t["test_id"], "title": t["title"], "duration_min": t["duration_min"],
        "paper": t.get("paper", ""), "question_count": len(t.get("questions", [])),
    } for t in tests]


@api.get("/admin/tests/{tid}")
async def admin_get_test(tid: str, _: Dict[str, Any] = Depends(require_admin)):
    t = await db.tests.find_one({"test_id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Test not found")
    return {
        "test_id": t["test_id"], "series_id": t["series_id"], "title": t["title"],
        "duration_min": t["duration_min"], "paper": t.get("paper", ""),
        "questions": t.get("questions", []),
    }


@api.post("/admin/tests")
async def admin_create_test(body: AdminTestIn, _: Dict[str, Any] = Depends(require_admin)):
    series = await db.test_series.find_one({"series_id": body.series_id})
    if not series:
        raise HTTPException(status_code=404, detail="Series not found")
    tid = f"test_{uuid.uuid4().hex[:10]}"
    await db.tests.insert_one({
        "test_id": tid, "series_id": body.series_id, "title": body.title,
        "duration_min": body.duration_min, "paper": body.paper,
        "questions": [q.dict() for q in body.questions],
        "deleted_at": None, "created_at": now(),
    })
    return {"ok": True, "test_id": tid}


@api.put("/admin/tests/{tid}")
async def admin_update_test(tid: str, body: AdminTestUpdateIn, _: Dict[str, Any] = Depends(require_admin)):
    update: Dict[str, Any] = {}
    if body.title is not None:
        update["title"] = body.title
    if body.duration_min is not None:
        update["duration_min"] = body.duration_min
    if body.paper is not None:
        update["paper"] = body.paper
    if body.questions is not None:
        update["questions"] = [q.dict() for q in body.questions]
    if update:
        await db.tests.update_one({"test_id": tid}, {"$set": update})
    return {"ok": True}


@api.delete("/admin/tests/{tid}")
async def admin_delete_test(tid: str, _: Dict[str, Any] = Depends(require_admin)):
    await db.tests.update_one({"test_id": tid}, {"$set": {"deleted_at": now()}})
    return {"ok": True}


# ----------------------------- Admin: Single user ---------------------------
@api.get("/admin/users/{uid}")
async def admin_user_detail(uid: str, _: Dict[str, Any] = Depends(require_admin)):
    u = await db.users.find_one({"user_id": uid}, {"_id": 0, "password": 0})
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    subs = await active_subscriptions(uid)
    out_subs = []
    for s in subs:
        cat = await db.categories.find_one({"category_id": s.get("category_id")}, {"_id": 0}) if s.get("category_id") else None
        out_subs.append({
            "subscription_id": s["subscription_id"], "plan": s["plan"],
            "category_id": s.get("category_id"),
            "category_name": cat["name"] if cat else "All Categories",
            "active_until": iso(s["active_until"]),
        })
    return {**public_user(u), "referred_by": u.get("referred_by"), "subscriptions": out_subs}


@api.put("/admin/users/{uid}")
async def admin_update_user(uid: str, body: UserUpdateIn, _: Dict[str, Any] = Depends(require_admin)):
    update: Dict[str, Any] = {}
    if body.is_admin is not None:
        update["is_admin"] = body.is_admin
    if body.token_balance is not None:
        update["token_balance"] = max(0, int(body.token_balance))
    if update:
        await db.users.update_one({"user_id": uid}, {"$set": update})
    return {"ok": True}


@api.post("/admin/users/{uid}/grant-subscription")
async def admin_grant_sub(uid: str, body: GrantSubIn, _: Dict[str, Any] = Depends(require_admin)):
    u = await db.users.find_one({"user_id": uid})
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    await db.subscriptions.insert_one({
        "subscription_id": f"sub_{uuid.uuid4().hex[:12]}",
        "user_id": uid, "plan": body.plan,
        "category_id": body.category_id if body.plan == "single" else None,
        "payment_order_id": None, "active": True,
        "active_until": now() + timedelta(days=body.days),
        "created_at": now(), "granted_by_admin": True,
    })
    await db.users.update_one({"user_id": uid}, {"$set": {"has_purchased": True}})
    return {"ok": True}


@api.post("/admin/users/{uid}/revoke-subscription")
async def admin_revoke_sub(uid: str, subscription_id: Optional[str] = None, _: Dict[str, Any] = Depends(require_admin)):
    query: Dict[str, Any] = {"user_id": uid, "active": True}
    if subscription_id:
        query["subscription_id"] = subscription_id
    await db.subscriptions.update_many(query, {"$set": {"active": False, "revoked_at": now()}})
    return {"ok": True}


@api.put("/admin/referral-config")
async def admin_referral_config(body: ReferralConfigIn, _: Dict[str, Any] = Depends(require_admin)):
    await get_settings()
    await db.settings.update_one({"_id": "app"}, {"$set": {
        "referral_enabled": body.referral_enabled,
        "tokens_per_referral": max(0, body.tokens_per_referral),
        "token_value": max(1, body.token_value),
        "payout_threshold": max(1, body.payout_threshold),
    }})
    return {"ok": True}


@api.post("/auth/change-password")
async def change_password(body: ChangePasswordIn, user: Dict[str, Any] = Depends(get_current_user), authorization: Optional[str] = Header(default=None)):
    if not user.get("password"):
        raise HTTPException(status_code=400, detail="Password login is not enabled for this account (Google sign-in)")
    if not verify_pw(body.current_password, user["password"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if body.current_password == body.new_password:
        raise HTTPException(status_code=400, detail="New password must be different from current password")
    if len(body.new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"password": hash_pw(body.new_password)}})
    if authorization and authorization.startswith("Bearer "):
        cur = authorization.split(" ", 1)[1]
        await db.user_sessions.delete_many({"user_id": user["user_id"], "session_token": {"$ne": cur}})
    return {"ok": True}


@api.get("/policies")
async def get_policies():
    p = await db.policies.find_one({"_id": "policies"}) or {}
    return {
        "terms": p.get("terms", ""), "refund": p.get("refund", ""), "privacy": p.get("privacy", ""),
        "updated_at": iso(p["updated_at"]) if p.get("updated_at") else None,
    }


@api.put("/admin/policies")
async def update_policies(body: PolicyIn, _: Dict[str, Any] = Depends(require_admin)):
    update: Dict[str, Any] = {"updated_at": now()}
    if body.terms is not None:
        update["terms"] = body.terms
    if body.refund is not None:
        update["refund"] = body.refund
    if body.privacy is not None:
        update["privacy"] = body.privacy
    await db.policies.update_one({"_id": "policies"}, {"$set": update}, upsert=True)
    return {"ok": True}


@api.post("/admin/ensure-series")
async def ensure_series_ep(body: EnsureSeriesIn, _: Dict[str, Any] = Depends(require_admin)):
    sid = await ensure_series(body.category_id, body.is_free, body.series_type)
    tests = await db.tests.count_documents({"series_id": sid, "deleted_at": None})
    return {"series_id": sid, "test_count": tests}


@api.post("/admin/bulk-upload-tagged")
async def bulk_upload_tagged(
    file: UploadFile = File(...),
    category_id: str = Form(...),
    is_free: str = Form("false"),
    series_type: str = Form("mock"),
    _: Dict[str, Any] = Depends(require_admin),
):
    content = await file.read()
    try:
        df = pd.read_excel(BytesIO(content), engine="openpyxl").fillna("")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read Excel file: {e}")
    sid = await ensure_series(category_id, is_free.lower() == "true", series_type)
    letter_map = {"A": 0, "B": 1, "C": 2, "D": 3}
    grouped: Dict[str, Dict[str, Any]] = {}
    for _, row in df.iterrows():
        r = {k: row[k] for k in df.columns}
        test_name = _col(r, "Test Name", "Test", "test_name")
        if not test_name:
            continue
        try:
            duration = int(float(_col(r, "Time Limit (min)", "Time Limit", "Duration") or 30))
        except Exception:
            duration = 30
        try:
            marks = float(_col(r, "Marks", "Mark") or 1)
        except Exception:
            marks = 1.0
        correct_raw = _col(r, "Correct Answer", "Answer", "Correct").upper()
        correct_index = letter_map.get(correct_raw, 0)
        if correct_raw.isdigit():
            correct_index = max(0, int(correct_raw) - 1)
        opts_en = [_col(r, "Option A (EN)", "Option A"), _col(r, "Option B (EN)", "Option B"),
                   _col(r, "Option C (EN)", "Option C"), _col(r, "Option D (EN)", "Option D")]
        opts_hi = [_col(r, "Option A (HI)"), _col(r, "Option B (HI)"),
                   _col(r, "Option C (HI)"), _col(r, "Option D (HI)")]
        q = {
            "question_en": _col(r, "Question Text (EN)", "Question Text", "Question"),
            "question_hi": _col(r, "Question Text (HI)"),
            "options_en": opts_en, "options_hi": opts_hi if any(opts_hi) else [],
            "correct_index": correct_index,
            "explanation_en": _col(r, "Explanation (EN)", "Explanation"),
            "explanation_hi": _col(r, "Explanation (HI)"), "marks": marks,
        }
        paper = _col(r, "Paper", "Paper No")
        key = f"{test_name}|{paper}"
        if key not in grouped:
            grouped[key] = {"test_name": test_name, "paper": paper, "duration": duration, "questions": []}
        grouped[key]["questions"].append(q)

    created_tests = created_questions = 0
    for g in grouped.values():
        await db.tests.insert_one({
            "test_id": f"test_{uuid.uuid4().hex[:10]}", "series_id": sid,
            "title": g["test_name"], "duration_min": g["duration"], "paper": g["paper"],
            "questions": g["questions"], "deleted_at": None, "created_at": now(),
        })
        created_tests += 1
        created_questions += len(g["questions"])
    return {"ok": True, "series_id": sid, "tests_created": created_tests, "questions_created": created_questions}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ----------------------------- Seed ------------------------------------------
SEED_CATEGORIES = [
    {"category_id": "gds_mts", "name": "GDS to MTS", "short": "GDS → MTS",
     "description": "Gramin Dak Sevak to Multi Tasking Staff", "order": 1},
    {"category_id": "postman_mailguard", "name": "Postman & Mail Guard", "short": "MTS → Postman",
     "description": "GDS / MTS to Postman & Mail Guard", "order": 2},
    {"category_id": "pa_sa", "name": "PA / SA", "short": "→ PA / SA",
     "description": "GDS / MTS / Postman to Postal & Sorting Assistant", "order": 3},
]


def _q(qen, qhi, opts_en, opts_hi, ci, exp_en, exp_hi):
    return {"question_en": qen, "question_hi": qhi, "options_en": opts_en, "options_hi": opts_hi,
            "correct_index": ci, "explanation_en": exp_en, "explanation_hi": exp_hi, "marks": 1.0}


def _sample_questions(topic: str):
    return [
        _q("Full form of GDS in India Post?", "इंडिया पोस्ट में GDS का पूर्ण रूप?",
           ["Gramin Dak Sevak", "General Delivery Service", "Grand Dak Sevak", "Gramin Delivery Staff"],
           ["ग्रामीण डाक सेवक", "जनरल डिलीवरी सर्विस", "ग्रैंड डाक सेवक", "ग्रामीण डिलीवरी स्टाफ"],
           0, "GDS stands for Gramin Dak Sevak.", "GDS का अर्थ ग्रामीण डाक सेवक है।"),
        _q("India Post comes under which ministry?", "इंडिया पोस्ट किस मंत्रालय के अंतर्गत आता है?",
           ["Ministry of Communications", "Ministry of Home", "Ministry of Finance", "Ministry of Defence"],
           ["संचार मंत्रालय", "गृह मंत्रालय", "वित्त मंत्रालय", "रक्षा मंत्रालय"],
           0, "Department of Posts is under the Ministry of Communications.", "डाक विभाग संचार मंत्रालय के अंतर्गत है।"),
        _q("If 3 pens cost ₹45, cost of 7 pens?", "यदि 3 पेन की कीमत ₹45 है, तो 7 पेन की कीमत?",
           ["₹90", "₹105", "₹115", "₹120"], ["₹90", "₹105", "₹115", "₹120"],
           1, "One pen = ₹15, so 7 pens = ₹105.", "एक पेन = ₹15, तो 7 पेन = ₹105।"),
        _q("Synonym of 'Rapid'?", "'Rapid' का पर्यायवाची?",
           ["Slow", "Quick", "Late", "Heavy"], ["धीमा", "तेज़", "देर", "भारी"],
           1, "Rapid means quick/fast.", "Rapid का अर्थ तेज़ होता है।"),
        _q("Which is the largest postal network in the world?", "विश्व का सबसे बड़ा डाक नेटवर्क कौन सा है?",
           ["India Post", "USPS", "China Post", "Royal Mail"], ["इंडिया पोस्ट", "यूएसपीएस", "चाइना पोस्ट", "रॉयल मेल"],
           0, "India Post has the largest postal network in the world.", "इंडिया पोस्ट का डाक नेटवर्क विश्व में सबसे बड़ा है।"),
    ]


async def seed():
    if await db.categories.count_documents({}) == 0:
        await db.categories.insert_many([dict(c) for c in SEED_CATEGORIES])
        logger.info("Seeded categories")

    await get_settings()

    if await db.test_series.count_documents({}) == 0:
        for cat in SEED_CATEGORIES:
            free_sid = f"series_{uuid.uuid4().hex[:10]}"
            paid_sid = f"series_{uuid.uuid4().hex[:10]}"
            await db.test_series.insert_many([
                {"series_id": free_sid, "title": f"{cat['name']} — Free Practice",
                 "category_id": cat["category_id"], "description": "Free practice tests to get started",
                 "is_free": True, "deleted_at": None, "created_at": now()},
                {"series_id": paid_sid, "title": f"{cat['name']} — Full Mock Series",
                 "category_id": cat["category_id"], "description": "Complete mock test series with All-India ranking",
                 "is_free": False, "deleted_at": None, "created_at": now()},
            ])
            for sid, is_free in [(free_sid, True), (paid_sid, False)]:
                count = 2 if is_free else 3
                for i in range(1, count + 1):
                    await db.tests.insert_one({
                        "test_id": f"test_{uuid.uuid4().hex[:10]}",
                        "series_id": sid,
                        "title": f"{cat['short']} Mock Test {i}",
                        "duration_min": 30,
                        "questions": _sample_questions(cat["category_id"]),
                        "deleted_at": None, "created_at": now(),
                    })
        logger.info("Seeded test series and tests")

    admin_email = "admin@dakmock.com"
    if not await db.users.find_one({"email": admin_email}):
        await db.users.insert_one({
            "user_id": f"user_{uuid.uuid4().hex[:12]}",
            "name": "DakMock Admin", "email": admin_email,
            "password": hash_pw("Admin@123"), "picture": None,
            "referral_code": gen_referral_code(), "referred_by": None,
            "token_balance": 0, "has_purchased": True, "is_admin": True,
            "auth_provider": "email", "created_at": now(),
        })
        logger.info("Seeded admin user")


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
    await seed()


@app.on_event("shutdown")
async def shutdown():
    client.close()
