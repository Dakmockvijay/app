"""
Iteration 5 — Validate the two backend endpoints that power the new
'Upload Excel (.xlsx)' + 'Sample Template Download' bucket UI.

1. GET  /api/admin/sample-template          -> public, xlsx download
2. POST /api/admin/bulk-upload-tagged       -> admin, multi-bucket upload
"""
import os
import io
import pandas as pd
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL must be set"
BASE_URL = BASE_URL.rstrip("/")

ADMIN_EMAIL = "admin@dakmock.com"
ADMIN_PASSWORD = "Admin@123"
SAMPLE_XLSX = "/app/sample_questions.xlsx"


# --- fixtures ---------------------------------------------------------------
@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Accept": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_token(session):
    r = session.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=20,
    )
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    tok = r.json().get("session_token") or r.json().get("access_token") or r.json().get("token")
    assert tok, f"no token in response: {r.json()}"
    return tok


# --- /admin/sample-template --------------------------------------------------
class TestSampleTemplate:
    def test_public_no_auth_returns_200(self, session):
        r = session.get(f"{BASE_URL}/api/admin/sample-template", timeout=20)
        assert r.status_code == 200, r.text

    def test_content_type_is_xlsx(self, session):
        r = session.get(f"{BASE_URL}/api/admin/sample-template", timeout=20)
        assert r.headers.get("content-type", "").startswith(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ), r.headers.get("content-type")

    def test_content_disposition_attachment(self, session):
        r = session.get(f"{BASE_URL}/api/admin/sample-template", timeout=20)
        cd = r.headers.get("content-disposition", "")
        assert "attachment" in cd.lower(), cd
        assert ".xlsx" in cd.lower(), cd

    def test_body_is_valid_xlsx_with_required_columns(self, session):
        r = session.get(f"{BASE_URL}/api/admin/sample-template", timeout=20)
        df = pd.read_excel(io.BytesIO(r.content), engine="openpyxl")
        required = {
            "Question Text (EN)", "Option A (EN)", "Option B (EN)",
            "Option C (EN)", "Option D (EN)", "Correct Answer",
            "Exam Category", "Test Name",
        }
        missing = required - set(df.columns)
        assert not missing, f"template missing columns: {missing}"
        assert len(df) >= 1


# --- /admin/bulk-upload-tagged across buckets --------------------------------
BUCKETS = [
    ("gds_mts", "true", "mock"),
    ("pa_sa", "false", "pyq"),
]


class TestBulkUploadMultipleBuckets:
    @pytest.mark.parametrize("category_id,is_free,series_type", BUCKETS)
    def test_upload_sample_xlsx(self, admin_token, category_id, is_free, series_type):
        with open(SAMPLE_XLSX, "rb") as fh:
            files = {"file": ("sample_questions.xlsx", fh,
                              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
            data = {"category_id": category_id, "is_free": is_free, "series_type": series_type}
            r = requests.post(
                f"{BASE_URL}/api/admin/bulk-upload-tagged",
                files=files, data=data,
                headers={"Authorization": f"Bearer {admin_token}"},
                timeout=60,
            )
        assert r.status_code == 200, f"{category_id}/{is_free}/{series_type} -> {r.status_code} {r.text}"
        body = r.json()
        assert body.get("ok") is True, body
        assert body.get("tests_created", 0) >= 1, body
        assert body.get("questions_created", 0) >= 1, body
        assert body.get("series_id"), body

    def test_bulk_upload_requires_auth(self):
        with open(SAMPLE_XLSX, "rb") as fh:
            files = {"file": ("sample_questions.xlsx", fh,
                              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
            data = {"category_id": "gds_mts", "is_free": "true", "series_type": "mock"}
            r = requests.post(
                f"{BASE_URL}/api/admin/bulk-upload-tagged",
                files=files, data=data, timeout=30,
            )
        assert r.status_code in (401, 403), r.status_code
