"""Iteration 2 tests: NEW admin-management flows + student-side reflection.

Covers:
- Admin CRUD on test-series (list/create/edit/soft-delete) & propagation to student endpoints
- Admin CRUD on tests inside a series with bilingual questions + paper label + duration
- Announcements (admin CRUD + student GET /announcements/active)
- Single-user admin management (detail, is_admin/token_balance patch, grant/revoke sub)
- Referral config PUT and its influence on payment/verify referral reward
- Paper field surfaced on student test list
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


# ---------- Fixtures ----------
@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="module")
def admin_h(s):
    r = s.post(f"{API}/auth/login", json={"email": "admin@dakmock.com", "password": "Admin@123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['session_token']}"}


def _register(s, **extra):
    email = f"test_{uuid.uuid4().hex[:8]}@dakmock.com"
    body = {"name": "TEST User", "email": email, "password": "Passw0rd!"}
    body.update(extra)
    r = s.post(f"{API}/auth/register", json=body)
    assert r.status_code == 200, r.text
    d = r.json()
    return {"email": email, "token": d["session_token"], "user": d["user"],
            "h": {"Authorization": f"Bearer {d['session_token']}"}}


# ---------- Admin: Test Series CRUD + Student reflection ----------
class TestAdminSeriesCRUD:
    def test_create_list_edit_delete_series(self, s, admin_h):
        # Create
        title = f"TEST Series {uuid.uuid4().hex[:6]}"
        r = s.post(f"{API}/admin/test-series", headers=admin_h,
                   json={"title": title, "category_id": "gds_mts",
                         "description": "seed desc", "is_free": True})
        assert r.status_code == 200, r.text
        sid = r.json()["series_id"]

        # List (admin) - must contain new sid
        r = s.get(f"{API}/admin/test-series", headers=admin_h)
        assert r.status_code == 200
        assert any(x["series_id"] == sid and x["title"] == title for x in r.json())

        # Student should see this new series (real-time via next fetch)
        student = _register(s)
        r = s.get(f"{API}/test-series", headers=student["h"])
        assert r.status_code == 200
        assert any(x["series_id"] == sid for x in r.json()), "New series not visible to student"

        # Edit
        new_title = title + " EDIT"
        r = s.put(f"{API}/admin/test-series/{sid}", headers=admin_h,
                  json={"title": new_title, "description": "new desc",
                        "is_free": False, "category_id": "gds_mts"})
        assert r.status_code == 200
        r = s.get(f"{API}/admin/test-series", headers=admin_h)
        assert any(x["series_id"] == sid and x["title"] == new_title and x["is_free"] is False
                   for x in r.json())

        # Soft-delete
        r = s.delete(f"{API}/admin/test-series/{sid}", headers=admin_h)
        assert r.status_code == 200
        r = s.get(f"{API}/admin/test-series", headers=admin_h)
        assert not any(x["series_id"] == sid for x in r.json())
        # Student no longer sees it
        r = s.get(f"{API}/test-series", headers=student["h"])
        assert not any(x["series_id"] == sid for x in r.json())


# ---------- Admin: Tests inside a series ----------
class TestAdminTestsCRUD:
    def test_create_edit_delete_test_with_paper_and_bilingual(self, s, admin_h):
        # Fresh series
        r = s.post(f"{API}/admin/test-series", headers=admin_h,
                   json={"title": f"TEST S {uuid.uuid4().hex[:6]}",
                         "category_id": "gds_mts", "is_free": True})
        sid = r.json()["series_id"]

        # Create test with bilingual question + paper label
        q = {
            "question_en": "2+2?", "question_hi": "2+2?",
            "options_en": ["3", "4", "5", "6"], "options_hi": ["३", "४", "५", "६"],
            "correct_index": 1, "explanation_en": "basic",
            "explanation_hi": "आधार", "marks": 1.0,
        }
        r = s.post(f"{API}/admin/tests", headers=admin_h, json={
            "series_id": sid, "title": "TEST T1",
            "duration_min": 45, "paper": "Paper 1", "questions": [q],
        })
        assert r.status_code == 200, r.text
        tid = r.json()["test_id"]

        # Admin list & full-test fetch (with correct answers)
        r = s.get(f"{API}/admin/test-series/{sid}/tests", headers=admin_h)
        assert r.status_code == 200
        row = next(x for x in r.json() if x["test_id"] == tid)
        assert row["paper"] == "Paper 1" and row["duration_min"] == 45

        r = s.get(f"{API}/admin/tests/{tid}", headers=admin_h)
        assert r.status_code == 200
        body = r.json()
        assert body["paper"] == "Paper 1"
        assert body["questions"][0]["correct_index"] == 1
        assert body["questions"][0]["question_hi"] == "2+2?"

        # Student side: paper field surfaces & test appears (series is free)
        student = _register(s)
        r = s.get(f"{API}/test-series/{sid}/tests", headers=student["h"])
        assert r.status_code == 200
        stests = r.json()["tests"]
        matched = next(x for x in stests if x["test_id"] == tid)
        assert matched["paper"] == "Paper 1"
        assert matched["question_count"] == 1
        # Ensure correct_index NOT leaked to student
        r = s.get(f"{API}/tests/{tid}", headers=student["h"])
        assert r.status_code == 200
        assert all("correct_index" not in q for q in r.json()["questions"])

        # Update test
        r = s.put(f"{API}/admin/tests/{tid}", headers=admin_h, json={
            "title": "TEST T1 EDIT", "duration_min": 60, "paper": "Paper 2",
        })
        assert r.status_code == 200
        r = s.get(f"{API}/admin/tests/{tid}", headers=admin_h)
        assert r.json()["title"] == "TEST T1 EDIT"
        assert r.json()["duration_min"] == 60
        assert r.json()["paper"] == "Paper 2"

        # Soft-delete test
        r = s.delete(f"{API}/admin/tests/{tid}", headers=admin_h)
        assert r.status_code == 200
        r = s.get(f"{API}/admin/test-series/{sid}/tests", headers=admin_h)
        assert not any(x["test_id"] == tid for x in r.json())
        # cleanup series
        s.delete(f"{API}/admin/test-series/{sid}", headers=admin_h)


# ---------- Announcements ----------
class TestAnnouncements:
    def test_admin_crud_and_student_active(self, s, admin_h):
        # Create active announcement
        r = s.post(f"{API}/admin/announcements", headers=admin_h,
                   json={"title": "TEST Ann", "message": "Hello students", "active": True})
        assert r.status_code == 200
        aid = r.json()["announcement_id"]

        # Admin list
        r = s.get(f"{API}/admin/announcements", headers=admin_h)
        assert any(x["announcement_id"] == aid for x in r.json())

        # Student sees active
        stu = _register(s)
        r = s.get(f"{API}/announcements/active", headers=stu["h"])
        assert r.status_code == 200
        data = r.json()
        assert data is not None and data["announcement_id"] == aid

        # Toggle inactive
        r = s.put(f"{API}/admin/announcements/{aid}", headers=admin_h,
                  json={"title": "TEST Ann", "message": "Hello students", "active": False})
        assert r.status_code == 200
        r = s.get(f"{API}/announcements/active", headers=stu["h"])
        # Either returns null or a different active announcement (but not this aid)
        data = r.json()
        assert data is None or data["announcement_id"] != aid

        # Delete
        r = s.delete(f"{API}/admin/announcements/{aid}", headers=admin_h)
        assert r.status_code == 200
        r = s.get(f"{API}/admin/announcements", headers=admin_h)
        assert not any(x["announcement_id"] == aid for x in r.json())


# ---------- Admin: Single user management ----------
class TestAdminUserManagement:
    def test_detail_update_grant_revoke(self, s, admin_h):
        stu = _register(s)
        uid = stu["user"]["user_id"]

        # Detail
        r = s.get(f"{API}/admin/users/{uid}", headers=admin_h)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["user_id"] == uid and d["subscriptions"] == []

        # Update is_admin + token_balance
        r = s.put(f"{API}/admin/users/{uid}", headers=admin_h,
                  json={"is_admin": True, "token_balance": 5})
        assert r.status_code == 200
        r = s.get(f"{API}/admin/users/{uid}", headers=admin_h)
        assert r.json()["is_admin"] is True
        assert r.json()["token_balance"] == 5

        # Grant combo subscription
        r = s.post(f"{API}/admin/users/{uid}/grant-subscription", headers=admin_h,
                   json={"plan": "combo", "days": 30})
        assert r.status_code == 200
        r = s.get(f"{API}/admin/users/{uid}", headers=admin_h)
        subs = r.json()["subscriptions"]
        assert len(subs) == 1 and subs[0]["plan"] == "combo"
        sub_id = subs[0]["subscription_id"]

        # User should now see has_access to any paid series
        r = s.get(f"{API}/test-series", headers=stu["h"])
        paid = [x for x in r.json() if not x["is_free"]]
        assert paid and all(p["purchased"] for p in paid), "combo did not grant access"

        # Revoke that subscription
        r = s.post(f"{API}/admin/users/{uid}/revoke-subscription?subscription_id={sub_id}",
                   headers=admin_h)
        assert r.status_code == 200
        r = s.get(f"{API}/admin/users/{uid}", headers=admin_h)
        assert r.json()["subscriptions"] == []

        # Grant single-category
        r = s.post(f"{API}/admin/users/{uid}/grant-subscription", headers=admin_h,
                   json={"plan": "single", "category_id": "pa_sa", "days": 15})
        assert r.status_code == 200
        r = s.get(f"{API}/admin/users/{uid}", headers=admin_h)
        subs = r.json()["subscriptions"]
        assert len(subs) == 1
        assert subs[0]["plan"] == "single" and subs[0]["category_id"] == "pa_sa"


# ---------- Referral config + reward on verify ----------
class TestReferralConfig:
    def test_referral_config_and_reward(self, s, admin_h):
        # Set tokens_per_referral=3, enabled=True
        r = s.put(f"{API}/admin/referral-config", headers=admin_h, json={
            "referral_enabled": True, "tokens_per_referral": 3,
            "token_value": 10, "payout_threshold": 10,
        })
        assert r.status_code == 200
        r = s.get(f"{API}/admin/settings", headers=admin_h)
        settings = r.json()
        assert settings["referral_enabled"] is True
        assert settings["tokens_per_referral"] == 3

        # A referrer, B referred user
        A = _register(s)
        # Get A's referral code
        r = s.get(f"{API}/referral", headers=A["h"])
        ref_code = r.json()["referral_code"]
        balance_before = r.json()["token_balance"]

        B = _register(s, referral_code=ref_code)

        # B buys combo (mock)
        r = s.post(f"{API}/payments/orders", headers=B["h"], json={"plan": "combo"})
        assert r.status_code == 200
        local_id = r.json()["local_order_id"]
        r = s.post(f"{API}/payments/verify", headers=B["h"],
                   json={"local_order_id": local_id})
        assert r.status_code == 200 and r.json()["status"] == "paid"

        # A should have gained +3 tokens
        r = s.get(f"{API}/referral", headers=A["h"])
        assert r.json()["token_balance"] == balance_before + 3

        # Disable referrals; another referred user should NOT reward A
        r = s.put(f"{API}/admin/referral-config", headers=admin_h, json={
            "referral_enabled": False, "tokens_per_referral": 3,
            "token_value": 10, "payout_threshold": 10,
        })
        assert r.status_code == 200

        C = _register(s, referral_code=ref_code)
        r = s.post(f"{API}/payments/orders", headers=C["h"], json={"plan": "combo"})
        local_id = r.json()["local_order_id"]
        r = s.post(f"{API}/payments/verify", headers=C["h"],
                   json={"local_order_id": local_id})
        assert r.status_code == 200

        r = s.get(f"{API}/referral", headers=A["h"])
        assert r.json()["token_balance"] == balance_before + 3, \
            "Reward should not be granted when referral_enabled=False"

        # Restore defaults
        s.put(f"{API}/admin/referral-config", headers=admin_h, json={
            "referral_enabled": True, "tokens_per_referral": 1,
            "token_value": 10, "payout_threshold": 10,
        })


# ---------- RBAC ----------
class TestAdminRBAC:
    def test_non_admin_forbidden_on_new_endpoints(self, s):
        stu = _register(s)
        h = stu["h"]
        for path in [
            "/admin/test-series", "/admin/announcements",
            f"/admin/users/{stu['user']['user_id']}",
        ]:
            r = s.get(f"{API}{path}", headers=h)
            assert r.status_code == 403, path
        r = s.put(f"{API}/admin/referral-config", headers=h, json={
            "referral_enabled": True, "tokens_per_referral": 1,
            "token_value": 10, "payout_threshold": 10,
        })
        assert r.status_code == 403
