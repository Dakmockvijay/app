"""DakMock backend API tests - end-to-end coverage of key flows."""
import os
import io
import uuid
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://dakmock-exam.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="session")
def admin_token(s):
    r = s.post(f"{API}/auth/login", json={"email": "admin@dakmock.com", "password": "Admin@123"})
    assert r.status_code == 200, r.text
    return r.json()["session_token"]


@pytest.fixture(scope="session")
def user_a(s):
    email = f"TEST_a_{uuid.uuid4().hex[:8]}@dakmock.com"
    r = s.post(f"{API}/auth/register", json={"name": "TEST User A", "email": email, "password": "Passw0rd!"})
    assert r.status_code == 200, r.text
    data = r.json()
    return {"email": email, "token": data["session_token"], "user": data["user"]}


# ---------- Auth ----------
class TestAuth:
    def test_root(self, s):
        r = s.get(f"{API}/")
        assert r.status_code == 200

    def test_register_login_me_logout(self, s):
        email = f"test_flow_{uuid.uuid4().hex[:8]}@dakmock.com"
        r = s.post(f"{API}/auth/register", json={"name": "Flow", "email": email, "password": "Passw0rd!"})
        assert r.status_code == 200
        tok = r.json()["session_token"]
        assert r.json()["user"]["email"] == email

        # login again
        r = s.post(f"{API}/auth/login", json={"email": email, "password": "Passw0rd!"})
        assert r.status_code == 200

        r = s.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {tok}"})
        assert r.status_code == 200
        assert r.json()["email"] == email

        r = s.post(f"{API}/auth/logout", headers={"Authorization": f"Bearer {tok}"})
        assert r.status_code == 200
        r = s.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {tok}"})
        assert r.status_code == 401

    def test_login_bad(self, s):
        r = s.post(f"{API}/auth/login", json={"email": "nope@x.com", "password": "wrong"})
        assert r.status_code == 401

    def test_duplicate_registration(self, s, user_a):
        r = s.post(f"{API}/auth/register", json={"name": "dup", "email": user_a["email"], "password": "x"})
        assert r.status_code == 400


# ---------- Catalog & Exam flow ----------
class TestCatalog:
    def test_categories(self, s):
        r = s.get(f"{API}/categories")
        assert r.status_code == 200
        cats = r.json()
        assert len(cats) == 3
        ids = {c["category_id"] for c in cats}
        assert ids == {"gds_mts", "postman_mailguard", "pa_sa"}

    def test_pricing(self, s):
        r = s.get(f"{API}/pricing")
        assert r.status_code == 200
        assert "single_price" in r.json() and "combo_price" in r.json()

    def test_series_and_free_exam(self, s, user_a):
        h = {"Authorization": f"Bearer {user_a['token']}"}
        r = s.get(f"{API}/test-series", headers=h)
        assert r.status_code == 200
        series = r.json()
        free = [x for x in series if x["is_free"]]
        assert free, "No free series seeded"
        paid = [x for x in series if not x["is_free"]]
        assert paid and all(not p["purchased"] for p in paid)

        sid = free[0]["series_id"]
        r = s.get(f"{API}/test-series/{sid}/tests", headers=h)
        assert r.status_code == 200
        tests = r.json()["tests"]
        assert tests
        tid = tests[0]["test_id"]

        r = s.get(f"{API}/tests/{tid}", headers=h)
        assert r.status_code == 200
        qs = r.json()["questions"]
        assert len(qs) >= 3

        # Submit all correct 0 answers (first sample uses correct_index 0 for many)
        answers = {str(q["index"]): 0 for q in qs}
        r = s.post(f"{API}/tests/{tid}/submit", headers=h,
                   json={"answers": answers, "time_taken_sec": 120})
        assert r.status_code == 200
        data = r.json()
        assert "score" in data and "rank" in data and "percentile" in data

        # attempt detail
        r = s.get(f"{API}/attempts/{data['attempt_id']}", headers=h)
        assert r.status_code == 200
        assert r.json()["detail"]

        # leaderboard
        r = s.get(f"{API}/tests/{tid}/leaderboard", headers=h)
        assert r.status_code == 200

    def test_paid_test_access_denied(self, s, user_a):
        h = {"Authorization": f"Bearer {user_a['token']}"}
        series = s.get(f"{API}/test-series", headers=h).json()
        paid = next(x for x in series if not x["is_free"])
        stests = s.get(f"{API}/test-series/{paid['series_id']}/tests", headers=h).json()["tests"]
        tid = stests[0]["test_id"]
        r = s.get(f"{API}/tests/{tid}", headers=h)
        assert r.status_code == 403


# ---------- Payments + referral reward ----------
class TestPaymentsReferral:
    def test_mock_purchase_and_referral(self, s, user_a):
        # user B registers with A's referral code
        ref_code = user_a["user"]["referral_code"]
        emailB = f"TEST_b_{uuid.uuid4().hex[:8]}@dakmock.com"
        rb = s.post(f"{API}/auth/register",
                    json={"name": "B", "email": emailB, "password": "Passw0rd!", "referral_code": ref_code})
        assert rb.status_code == 200
        tokenB = rb.json()["session_token"]
        hB = {"Authorization": f"Bearer {tokenB}"}

        # Create combo order (mock)
        r = s.post(f"{API}/payments/orders", headers=hB, json={"plan": "combo"})
        assert r.status_code == 200, r.text
        order = r.json()
        assert order["mock"] is True
        local_id = order["local_order_id"]

        # Verify mock payment
        r = s.post(f"{API}/payments/verify", headers=hB, json={"local_order_id": local_id})
        assert r.status_code == 200 and r.json()["status"] == "paid"

        # Subscription active for B
        r = s.get(f"{API}/subscriptions", headers=hB)
        assert r.status_code == 200
        subs = r.json()
        assert any(x["plan"] == "combo" for x in subs)

        # A's token_balance should have incremented by 1
        hA = {"Authorization": f"Bearer {user_a['token']}"}
        r = s.get(f"{API}/referral", headers=hA)
        assert r.status_code == 200
        assert r.json()["token_balance"] >= 1
        assert any(ref["referred_id"] == rb.json()["user"]["user_id"] for ref in r.json()["referrals"])

    def test_single_plan_requires_category(self, s, user_a):
        h = {"Authorization": f"Bearer {user_a['token']}"}
        r = s.post(f"{API}/payments/orders", headers=h, json={"plan": "single"})
        assert r.status_code == 400


# ---------- Wallet / Support ----------
class TestWalletSupport:
    def test_payout_below_threshold(self, s, user_a):
        h = {"Authorization": f"Bearer {user_a['token']}"}
        r = s.post(f"{API}/payout-requests", headers=h, json={"method": "upi", "account": "x@ybl"})
        assert r.status_code == 400

    def test_support_ticket(self, s, user_a):
        h = {"Authorization": f"Bearer {user_a['token']}"}
        r = s.post(f"{API}/support-tickets", headers=h,
                   json={"subject": "TEST hello", "message": "TEST issue message"})
        assert r.status_code == 200

    def test_support_config(self, s):
        r = s.get(f"{API}/support-config")
        assert r.status_code == 200 and "support_email" in r.json()


# ---------- Admin ----------
class TestAdmin:
    def test_stats_users_tickets(self, s, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        for path in ["/admin/stats", "/admin/users", "/admin/tickets", "/admin/payout-requests", "/admin/settings"]:
            r = s.get(f"{API}{path}", headers=h)
            assert r.status_code == 200, path

    def test_non_admin_forbidden(self, s, user_a):
        h = {"Authorization": f"Bearer {user_a['token']}"}
        r = s.get(f"{API}/admin/stats", headers=h)
        assert r.status_code == 403

    def test_pricing_update_and_verify(self, s, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        r = s.put(f"{API}/admin/pricing", headers=h, json={"single_price": 199, "combo_price": 299})
        assert r.status_code == 200
        r = s.get(f"{API}/pricing")
        assert r.json()["single_price"] == 199 and r.json()["combo_price"] == 299
        # restore
        s.put(f"{API}/admin/pricing", headers=h, json={"single_price": 149, "combo_price": 249})

    def test_bulk_upload_template_and_upload(self, s, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        r = s.get(f"{API}/admin/sample-template", headers=h)
        assert r.status_code == 200
        content = r.content
        files = {"file": ("template.xlsx", content,
                          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
        # requests session default header is JSON; override
        r = requests.post(f"{API}/admin/bulk-upload", headers={"Authorization": f"Bearer {admin_token}"}, files=files)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["tests_created"] >= 1 and data["questions_created"] >= 1
