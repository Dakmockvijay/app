"""Backend tests for admin test-editor IMAGE attachments feature.

Covers:
  - POST /api/admin/upload-image (admin only, multipart `file`)
  - GET  /api/files/{image_id} (public image streaming)
  - POST/GET /api/admin/tests (image fields persistence)
  - GET  /api/tests/{id}?practice=true (image fields returned to student)
  - Regression: bulk-upload-tagged still works
  - Regression: normal (no-image) questions still save/fetch
  - Image-only options accepted (option considered filled if text OR image)
"""
import io
import os
import struct
import zlib
import pytest
import requests
from openpyxl import Workbook

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://dakmock-exam.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@dakmock.com"
ADMIN_PASS = "Admin@123"
SEEDED_IMAGE_URL = "/api/files/3e34f06965c74dfb8c8b35fb17ee3dd8"


def _make_png_bytes(w: int = 2, h: int = 2) -> bytes:
    """Build a minimal valid PNG in-memory (no external deps)."""
    def chunk(ctype: bytes, data: bytes) -> bytes:
        return (struct.pack(">I", len(data)) + ctype + data +
                struct.pack(">I", zlib.crc32(ctype + data) & 0xFFFFFFFF))
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)  # 8-bit RGB
    raw = b""
    for _ in range(h):
        raw += b"\x00" + b"\xff\x00\x00" * w  # filter byte + red pixels
    idat = zlib.compress(raw)
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=20)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    tok = r.json().get("session_token")
    assert tok, "Admin login response missing session_token"
    return tok


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def user_token():
    # self-register a disposable user so we can hit /api/tests/{id}?practice=true
    email = f"TEST_imguser_{os.urandom(4).hex()}@example.com"
    r = requests.post(f"{API}/auth/register",
                      json={"name": "TEST Img User", "email": email, "password": "Test@12345"}, timeout=20)
    assert r.status_code == 200, f"Register failed: {r.status_code} {r.text}"
    return r.json()["session_token"]


@pytest.fixture(scope="module")
def user_headers(user_token):
    return {"Authorization": f"Bearer {user_token}"}


@pytest.fixture(scope="module")
def free_series_id(admin_headers):
    r = requests.get(f"{API}/admin/test-series", headers=admin_headers, timeout=20)
    assert r.status_code == 200
    rows = r.json()
    free = [s for s in rows if s.get("is_free") and s.get("category_id") == "gds_mts"]
    assert free, "No free gds_mts series found"
    return free[0]["series_id"]


# ---------------- track + teardown ----------------
_CREATED_TESTS: list[str] = []


@pytest.fixture(scope="module", autouse=True)
def _cleanup(admin_headers):
    yield
    for tid in _CREATED_TESTS:
        try:
            requests.delete(f"{API}/admin/tests/{tid}", headers=admin_headers, timeout=10)
        except Exception:
            pass


# =====================================================================
#  Module: /api/admin/upload-image + /api/files/{id}
# =====================================================================
class TestUploadImage:
    def test_requires_auth_401(self):
        r = requests.post(f"{API}/admin/upload-image",
                          files={"file": ("x.png", _make_png_bytes(), "image/png")}, timeout=20)
        assert r.status_code in (401, 403), f"Expected 401/403, got {r.status_code}: {r.text}"

    def test_non_admin_forbidden(self, user_headers):
        r = requests.post(f"{API}/admin/upload-image",
                          headers=user_headers,
                          files={"file": ("x.png", _make_png_bytes(), "image/png")}, timeout=30)
        assert r.status_code in (401, 403), f"Expected 401/403 for non-admin, got {r.status_code}"

    def test_empty_file_rejected(self, admin_headers):
        r = requests.post(f"{API}/admin/upload-image",
                          headers=admin_headers,
                          files={"file": ("empty.png", b"", "image/png")}, timeout=30)
        assert r.status_code == 400, f"Expected 400 for empty, got {r.status_code}: {r.text}"

    def test_upload_returns_url_and_serves(self, admin_headers):
        png = _make_png_bytes(4, 4)
        r = requests.post(f"{API}/admin/upload-image",
                          headers=admin_headers,
                          files={"file": ("red.png", png, "image/png")}, timeout=60)
        assert r.status_code == 200, f"Upload failed: {r.status_code} {r.text}"
        body = r.json()
        assert "image_id" in body and "url" in body
        assert body["url"] == f"/api/files/{body['image_id']}"
        # Public GET should stream image bytes with image/* content-type
        g = requests.get(f"{BASE_URL}{body['url']}", timeout=30)
        assert g.status_code == 200, f"Serve failed: {g.status_code}"
        assert g.headers.get("Content-Type", "").startswith("image/"), g.headers
        assert len(g.content) > 0
        # stash for later tests
        pytest.uploaded_url = body["url"]
        pytest.uploaded_id = body["image_id"]

    def test_get_unknown_image_404(self):
        r = requests.get(f"{API}/files/does_not_exist_xyz_0001", timeout=20)
        assert r.status_code == 404

    def test_seeded_image_url_serves(self):
        r = requests.get(f"{BASE_URL}{SEEDED_IMAGE_URL}", timeout=30)
        assert r.status_code == 200
        assert r.headers.get("Content-Type", "").startswith("image/")


# =====================================================================
#  Module: image fields persist through admin + student endpoints
# =====================================================================
class TestImagePersistence:
    def test_create_test_with_images_and_fetch(self, admin_headers, user_headers, free_series_id):
        url = getattr(pytest, "uploaded_url", SEEDED_IMAGE_URL)
        payload = {
            "series_id": free_series_id,
            "title": f"TEST_IMG_PERSIST_{os.urandom(3).hex()}",
            "duration_min": 10,
            "paper": "",
            "questions": [{
                "question_en": "Which image is red?",
                "question_hi": "कौन सी छवि लाल है?",
                "options_en": ["red", "blue", "green", ""],  # D is image-only
                "options_hi": ["लाल", "", "", ""],
                "correct_index": 0,
                "explanation_en": "red one",
                "explanation_hi": "",
                "marks": 1,
                "question_image_en": url,
                "question_image_hi": url,
                "option_images_en": [url, url, url, url],
                "option_images_hi": [url, "", "", ""],
            }],
        }
        c = requests.post(f"{API}/admin/tests", headers=admin_headers, json=payload, timeout=30)
        assert c.status_code == 200, f"Create failed: {c.status_code} {c.text}"
        tid = c.json()["test_id"]
        _CREATED_TESTS.append(tid)

        # admin GET returns exact image fields
        g = requests.get(f"{API}/admin/tests/{tid}", headers=admin_headers, timeout=20)
        assert g.status_code == 200
        q = g.json()["questions"][0]
        assert q["question_image_en"] == url
        assert q["question_image_hi"] == url
        assert q["option_images_en"] == [url, url, url, url]
        assert q["option_images_hi"] == [url, "", "", ""]

        # student GET (practice) also returns image fields
        s = requests.get(f"{API}/tests/{tid}?practice=true", headers=user_headers, timeout=20)
        assert s.status_code == 200, f"Student GET failed: {s.status_code} {s.text}"
        sq = s.json()["questions"][0]
        assert sq["question_image_en"] == url
        assert sq["question_image_hi"] == url
        assert sq["option_images_en"] == [url, url, url, url]
        assert sq["option_images_hi"] == [url, "", "", ""]

    def test_image_only_option_accepted(self, admin_headers, user_headers, free_series_id):
        """Option D has NO text but HAS an image — must still be stored & returned."""
        url = getattr(pytest, "uploaded_url", SEEDED_IMAGE_URL)
        payload = {
            "series_id": free_series_id,
            "title": f"TEST_IMG_ONLY_OPT_{os.urandom(3).hex()}",
            "duration_min": 5,
            "questions": [{
                "question_en": "Pick the right one",
                "options_en": ["one", "two", "three", ""],
                "correct_index": 3,
                "marks": 1,
                "option_images_en": ["", "", "", url],
            }],
        }
        c = requests.post(f"{API}/admin/tests", headers=admin_headers, json=payload, timeout=30)
        assert c.status_code == 200, c.text
        tid = c.json()["test_id"]
        _CREATED_TESTS.append(tid)
        s = requests.get(f"{API}/tests/{tid}?practice=true", headers=user_headers, timeout=20)
        assert s.status_code == 200
        sq = s.json()["questions"][0]
        assert sq["options_en"][3] == ""
        assert sq["option_images_en"][3] == url


# =====================================================================
#  Module: regression — bulk upload + no-image path still work
# =====================================================================
class TestRegression:
    def test_bulk_upload_tagged_still_works(self, admin_headers):
        wb = Workbook()
        ws = wb.active
        ws.append(["Test Name", "Question Text (EN)",
                   "Option A (EN)", "Option B (EN)", "Option C (EN)", "Option D (EN)",
                   "Correct Answer", "Marks", "Time Limit (min)"])
        suffix = os.urandom(3).hex()
        tname = f"TEST_IMG_BULK_{suffix}"
        ws.append([tname, "2+2=?", "3", "4", "5", "6", "B", 1, 10])
        ws.append([tname, "Capital of India?", "Mumbai", "Kolkata", "New Delhi", "Chennai", "C", 1, 10])
        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        r = requests.post(
            f"{API}/admin/bulk-upload-tagged",
            headers=admin_headers,
            files={"file": ("bulk.xlsx", buf.getvalue(),
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            data={"category_id": "gds_mts", "is_free": "true", "series_type": "mock"},
            timeout=60,
        )
        assert r.status_code == 200, f"Bulk upload failed: {r.status_code} {r.text}"
        body = r.json()
        assert body["tests_created"] >= 1
        assert body["questions_created"] >= 2
        # find created test to delete at teardown
        sid = body["series_id"]
        lst = requests.get(f"{API}/admin/test-series/{sid}/tests", headers=admin_headers, timeout=20)
        if lst.status_code == 200:
            for t in lst.json():
                if t["title"] == tname:
                    _CREATED_TESTS.append(t["test_id"])

    def test_normal_no_image_question_still_saves(self, admin_headers, user_headers, free_series_id):
        payload = {
            "series_id": free_series_id,
            "title": f"TEST_IMG_NOIMG_{os.urandom(3).hex()}",
            "duration_min": 5,
            "questions": [{
                "question_en": "No image here",
                "options_en": ["a", "b", "c", "d"],
                "correct_index": 1,
                "marks": 1,
            }],
        }
        c = requests.post(f"{API}/admin/tests", headers=admin_headers, json=payload, timeout=30)
        assert c.status_code == 200, c.text
        tid = c.json()["test_id"]
        _CREATED_TESTS.append(tid)
        s = requests.get(f"{API}/tests/{tid}?practice=true", headers=user_headers, timeout=20)
        assert s.status_code == 200
        sq = s.json()["questions"][0]
        assert sq.get("question_image_en", "") == ""
        assert sq.get("option_images_en", []) in ([], ["", "", "", ""])

    def test_submit_scores_correctly_with_image_question(self, admin_headers, user_headers, free_series_id):
        url = getattr(pytest, "uploaded_url", SEEDED_IMAGE_URL)
        payload = {
            "series_id": free_series_id,
            "title": f"TEST_IMG_SCORE_{os.urandom(3).hex()}",
            "duration_min": 5,
            "questions": [{
                "question_en": "Which?",
                "options_en": ["one", "two", "three", "four"],
                "correct_index": 2,
                "marks": 1,
                "question_image_en": url,
                "option_images_en": [url, "", url, ""],
            }],
        }
        c = requests.post(f"{API}/admin/tests", headers=admin_headers, json=payload, timeout=30)
        assert c.status_code == 200, c.text
        tid = c.json()["test_id"]
        _CREATED_TESTS.append(tid)
        # submit correct answer
        s = requests.post(
            f"{API}/tests/{tid}/submit",
            headers=user_headers,
            json={"answers": {"0": 2}, "time_taken_sec": 5, "mode": "mock"},
            timeout=20,
        )
        assert s.status_code == 200, s.text
        body = s.json()
        assert body["score"] == 1 or body.get("correct") == 1
