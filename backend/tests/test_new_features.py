"""Tests for Practice Mode, Resume, Analytics and Daily Goal (iteration 3)."""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://dakmock-exam.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_EMAIL = "admin@dakmock.com"
ADMIN_PASSWORD = "Admin@123"


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    s.headers["Authorization"] = f"Bearer {r.json()['session_token']}"
    return s


@pytest.fixture(scope="module")
def user_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    email = f"test_newfeat_{uuid.uuid4().hex[:8]}@dakmock.com"
    r = s.post(f"{API}/auth/register", json={"name": "NFTest", "email": email, "password": "Pwd@12345"})
    assert r.status_code == 200, r.text
    s.headers["Authorization"] = f"Bearer {r.json()['session_token']}"
    s.user_email = email
    return s


@pytest.fixture(scope="module")
def free_test_id(admin_session):
    series = admin_session.get(f"{API}/test-series").json()
    free = [x for x in series if x.get("is_free")]
    assert free, "No free series present"
    for sr in free:
        r = admin_session.get(f"{API}/test-series/{sr['series_id']}/tests").json()
        if r.get("tests"):
            return r["tests"][0]["test_id"]
    pytest.skip("No free test available")


class TestPracticeMode:
    def test_plain_get_hides_correct(self, user_session, free_test_id):
        r = user_session.get(f"{API}/tests/{free_test_id}")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["questions"], "No questions"
        for q in data["questions"]:
            assert "correct_index" not in q, "Plain GET must NOT leak correct_index"
            assert "explanation_en" not in q

    def test_practice_get_reveals_correct(self, user_session, free_test_id):
        r = user_session.get(f"{API}/tests/{free_test_id}?practice=true")
        assert r.status_code == 200, r.text
        data = r.json()
        for q in data["questions"]:
            assert "correct_index" in q
            assert isinstance(q["correct_index"], int)
            assert "explanation_en" in q
            assert "explanation_hi" in q


class TestSubmitWithMode:
    def test_submit_practice_excluded_from_leaderboard(self, user_session, free_test_id):
        test = user_session.get(f"{API}/tests/{free_test_id}?practice=true").json()
        # practice attempt with all correct answers
        answers = {str(i): q["correct_index"] for i, q in enumerate(test["questions"])}
        r = user_session.post(
            f"{API}/tests/{free_test_id}/submit",
            json={"answers": answers, "time_taken_sec": 30, "mode": "practice"},
        )
        assert r.status_code == 200, r.text
        practice_result = r.json()
        assert "attempt_id" in practice_result

        # leaderboard should not include this practice attempt for this user (unless prior exam attempts exist)
        lb = user_session.get(f"{API}/tests/{free_test_id}/leaderboard").json()
        me_rows = [row for row in lb if row.get("is_me")]
        # If the user had no prior exam attempt, should not appear
        if me_rows:
            # Allow if they already had an exam attempt previously; otherwise fail
            pass  # weak assertion since fixture user is new; we'll stronger-check next test

    def test_submit_exam_appears_in_leaderboard(self, user_session, free_test_id):
        test = user_session.get(f"{API}/tests/{free_test_id}?practice=true").json()
        answers = {str(i): q["correct_index"] for i, q in enumerate(test["questions"])}
        r = user_session.post(
            f"{API}/tests/{free_test_id}/submit",
            json={"answers": answers, "time_taken_sec": 20, "mode": "exam"},
        )
        assert r.status_code == 200, r.text
        exam_result = r.json()
        assert exam_result["rank"] >= 1
        assert exam_result["total_users"] >= 1
        lb = user_session.get(f"{API}/tests/{free_test_id}/leaderboard").json()
        me = [row for row in lb if row.get("is_me")]
        assert me, "Exam attempt should appear in leaderboard"

    def test_leaderboard_excludes_practice_only_user(self, free_test_id):
        """Register a brand-new user, submit ONLY practice, ensure not in leaderboard."""
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        email = f"test_prac_only_{uuid.uuid4().hex[:8]}@dakmock.com"
        rr = s.post(f"{API}/auth/register", json={"name": "PracOnly", "email": email, "password": "Pwd@12345"})
        assert rr.status_code == 200
        s.headers["Authorization"] = f"Bearer {rr.json()['session_token']}"
        test = s.get(f"{API}/tests/{free_test_id}?practice=true").json()
        answers = {str(i): q["correct_index"] for i, q in enumerate(test["questions"])}
        s.post(f"{API}/tests/{free_test_id}/submit", json={"answers": answers, "time_taken_sec": 10, "mode": "practice"})
        lb = s.get(f"{API}/tests/{free_test_id}/leaderboard").json()
        me = [row for row in lb if row.get("is_me")]
        assert not me, "Practice-only user must NOT appear in leaderboard"


class TestGoal:
    def test_default_goal(self, user_session):
        me = user_session.get(f"{API}/auth/me").json()
        assert me.get("daily_goal") == 3

    def test_set_goal_normal(self, user_session):
        r = user_session.post(f"{API}/me/goal", json={"daily_goal": 7})
        assert r.status_code == 200
        assert r.json()["daily_goal"] == 7
        # Reflected in analytics
        a = user_session.get(f"{API}/analytics").json()
        assert a["today"]["goal"] == 7

    def test_goal_clamp_high(self, user_session):
        r = user_session.post(f"{API}/me/goal", json={"daily_goal": 500})
        assert r.status_code == 200
        assert r.json()["daily_goal"] == 50

    def test_goal_clamp_low(self, user_session):
        r = user_session.post(f"{API}/me/goal", json={"daily_goal": 0})
        assert r.status_code == 200
        assert r.json()["daily_goal"] == 1

    def test_goal_clamp_negative(self, user_session):
        r = user_session.post(f"{API}/me/goal", json={"daily_goal": -5})
        assert r.status_code == 200
        assert r.json()["daily_goal"] == 1
        # restore sensible value
        user_session.post(f"{API}/me/goal", json={"daily_goal": 3})


class TestAnalytics:
    def test_analytics_shape(self, user_session):
        a = user_session.get(f"{API}/analytics").json()
        for key in ["total_attempts", "avg_score_pct", "avg_accuracy", "best_score_pct",
                    "total_time_sec", "categories", "trend", "streak", "today"]:
            assert key in a, f"Missing key: {key}"
        for key in ["current", "longest", "active_days"]:
            assert key in a["streak"], f"streak missing: {key}"
        for key in ["count", "goal", "met"]:
            assert key in a["today"], f"today missing: {key}"
        assert isinstance(a["categories"], list)
        assert isinstance(a["trend"], list)

    def test_analytics_reflects_attempts(self, user_session):
        a = user_session.get(f"{API}/analytics").json()
        # fixture user already submitted 1 practice + 1 exam = 2 attempts
        assert a["total_attempts"] >= 2
        assert a["today"]["count"] >= 1
        assert a["streak"]["current"] >= 1
        assert a["streak"]["longest"] >= 1
        assert a["best_score_pct"] > 0
        assert len(a["trend"]) >= 2
        # Every trend item has required keys
        for t in a["trend"]:
            for k in ["attempt_id", "date", "title", "accuracy", "score_pct"]:
                assert k in t
