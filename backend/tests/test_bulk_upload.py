"""Iteration 4 tests: /admin/ensure-series and /admin/bulk-upload-tagged.
Covers the Manage Tests 4-level bucket flow (category/is_free/series_type) and
the bulk Excel upload using /app/sample_questions.xlsx.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"
SAMPLE_XLSX = "/app/sample_questions.xlsx"


@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def admin_h(s):
    r = s.post(f"{API}/auth/login", json={"email": "admin@dakmock.com", "password": "Admin@123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['session_token']}"}


class TestEnsureSeries:
    """POST /api/admin/ensure-series must return 200 with series_id for each bucket."""

    @pytest.mark.parametrize("cat,is_free,stype", [
        ("gds_mts", True, "mock"),
        ("gds_mts", False, "mock"),
        ("gds_mts", True, "pyq"),
        ("gds_mts", False, "pyq"),
        ("pa_sa", True, "mock"),
        ("pa_sa", False, "pyq"),
    ])
    def test_ensure_series_variants(self, s, admin_h, cat, is_free, stype):
        r = s.post(f"{API}/admin/ensure-series", headers=admin_h,
                   json={"category_id": cat, "is_free": is_free, "series_type": stype})
        assert r.status_code == 200, r.text
        d = r.json()
        assert "series_id" in d and isinstance(d["series_id"], str) and d["series_id"]
        assert "test_count" in d and isinstance(d["test_count"], int)

    def test_ensure_series_is_idempotent(self, s, admin_h):
        payload = {"category_id": "postman_mailguard", "is_free": True, "series_type": "mock"}
        r1 = s.post(f"{API}/admin/ensure-series", headers=admin_h, json=payload)
        r2 = s.post(f"{API}/admin/ensure-series", headers=admin_h, json=payload)
        assert r1.status_code == 200 and r2.status_code == 200
        assert r1.json()["series_id"] == r2.json()["series_id"], "ensure-series must be idempotent"

    def test_series_tests_listing_works(self, s, admin_h):
        """After ensure-series, GET /admin/test-series/{sid}/tests must return a list."""
        r = s.post(f"{API}/admin/ensure-series", headers=admin_h,
                   json={"category_id": "gds_mts", "is_free": True, "series_type": "mock"})
        sid = r.json()["series_id"]
        r = s.get(f"{API}/admin/test-series/{sid}/tests", headers=admin_h)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_ensure_series_requires_admin(self, s):
        """Non-admin must be 401/403 — the Pressable in UI is gated by admin."""
        r = s.post(f"{API}/admin/ensure-series",
                   json={"category_id": "gds_mts", "is_free": True, "series_type": "mock"})
        assert r.status_code in (401, 403)


class TestBulkUploadTagged:
    """POST /api/admin/bulk-upload-tagged with sample xlsx must create tests & questions."""

    def test_upload_sample_xlsx_creates_tests(self, s, admin_h):
        assert os.path.exists(SAMPLE_XLSX), f"sample file missing at {SAMPLE_XLSX}"
        # Target a fresh bucket (pyq+free+pa_sa) to keep counts clean
        cat, is_free, stype = "pa_sa", True, "pyq"
        # Count tests before
        pre = s.post(f"{API}/admin/ensure-series", headers=admin_h,
                     json={"category_id": cat, "is_free": is_free, "series_type": stype})
        assert pre.status_code == 200
        sid = pre.json()["series_id"]
        before = s.get(f"{API}/admin/test-series/{sid}/tests", headers=admin_h).json()
        before_count = len(before)

        with open(SAMPLE_XLSX, "rb") as f:
            files = {"file": ("sample_questions.xlsx", f,
                              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
            data = {"category_id": cat, "is_free": str(is_free).lower(), "series_type": stype}
            r = s.post(f"{API}/admin/bulk-upload-tagged", headers={"Authorization": admin_h["Authorization"]},
                       files=files, data=data)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert body["series_id"] == sid
        assert body["tests_created"] >= 1
        assert body["questions_created"] >= 1

        # After upload, bucket listing shows at least `tests_created` new rows
        after = s.get(f"{API}/admin/test-series/{sid}/tests", headers=admin_h).json()
        assert len(after) >= before_count + body["tests_created"], (
            f"Listing didn't grow as expected: before={before_count} after={len(after)} "
            f"tests_created={body['tests_created']}"
        )
        # The newly created test(s) must have questions > 0 when fetched by admin
        new_tids = [t["test_id"] for t in after if t["test_id"] not in {b["test_id"] for b in before}]
        assert new_tids, "No new test_ids found after upload"
        full = s.get(f"{API}/admin/tests/{new_tids[0]}", headers=admin_h).json()
        assert len(full.get("questions", [])) >= 1
        q0 = full["questions"][0]
        assert "question_en" in q0
        assert isinstance(q0.get("options_en"), list) and len(q0["options_en"]) == 4
        assert isinstance(q0.get("correct_index"), int) and 0 <= q0["correct_index"] <= 3

    def test_upload_bad_file_returns_400(self, s, admin_h):
        files = {"file": ("not_excel.txt", b"hello world", "text/plain")}
        data = {"category_id": "gds_mts", "is_free": "true", "series_type": "mock"}
        r = s.post(f"{API}/admin/bulk-upload-tagged", headers={"Authorization": admin_h["Authorization"]},
                   files=files, data=data)
        assert r.status_code == 400, r.text

    def test_upload_requires_admin(self, s):
        with open(SAMPLE_XLSX, "rb") as f:
            files = {"file": ("sample_questions.xlsx", f,
                              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
            data = {"category_id": "gds_mts", "is_free": "true", "series_type": "mock"}
            r = s.post(f"{API}/admin/bulk-upload-tagged", files=files, data=data)
        assert r.status_code in (401, 403)
