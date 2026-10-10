"""
Tests for DakMock bulk-upload-tagged parser bug fixes:
  BUG1: Test Name forward-fill across rows in a group.
  BUG2: Option columns without "(EN)" suffix read into options_en;
        rows with only 2 options yield ['opt1','opt2','',''] (not a crash).
Also verifies GET /api/tests/{id}?practice=true returns all parsed questions.
"""
import os
import requests
import pytest

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://dakmock-exam.preview.emergentagent.com").rstrip("/")
MESSY_XLSX = "/app/messy_test.xlsx"
ADMIN_EMAIL = "admin@dakmock.com"
ADMIN_PASSWORD = "Admin@123"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text[:200]}"
    data = r.json()
    tok = data.get("session_token") or data.get("token") or data.get("access_token")
    assert tok, f"No token in login response: {data}"
    return tok


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def uploaded_test(auth_headers):
    """Upload /app/messy_test.xlsx into gds_mts / free / mock."""
    with open(MESSY_XLSX, "rb") as fh:
        files = {"file": ("messy_test.xlsx", fh, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
        data = {"category_id": "gds_mts", "is_free": "true", "series_type": "mock"}
        r = requests.post(f"{BASE_URL}/api/admin/bulk-upload-tagged", headers=auth_headers, files=files, data=data, timeout=60)
    assert r.status_code == 200, f"Upload failed {r.status_code}: {r.text[:300]}"
    body = r.json()
    assert body.get("ok") is True, body
    assert body.get("tests_created", 0) >= 1, body
    # BUG1 verification: all 4 non-empty rows must be grouped into ONE test
    assert body.get("questions_created") == 4, f"Expected 4 questions, got {body.get('questions_created')}: {body}"
    return body


# ----- BUG1: forward-fill Test Name -----
def test_bug1_single_test_created(uploaded_test):
    """Only ONE test is created from messy_test.xlsx (Test Name only on row 1)."""
    assert uploaded_test["tests_created"] == 1


def _list_series_tests(auth_headers, sid):
    r = requests.get(f"{BASE_URL}/api/admin/test-series/{sid}/tests", headers=auth_headers, timeout=20)
    assert r.status_code == 200, f"admin tests list {r.status_code}: {r.text[:200]}"
    body = r.json()
    return body if isinstance(body, list) else body.get("tests", [])


def test_bug1_all_questions_present_in_test(auth_headers, uploaded_test):
    """GET /api/tests/{id}?practice=true returns all 4 questions grouped under the test."""
    sid = uploaded_test["series_id"]
    tests = _list_series_tests(auth_headers, sid)
    messy = [t for t in tests if t.get("title") == "Messy Mock A"]
    assert messy, f"Messy Mock A not found. tests: {[t.get('title') for t in tests]}"
    # Pick newest
    messy_test = messy[-1]
    tid = messy_test.get("test_id") or messy_test.get("id")
    assert tid, messy_test
    r = requests.get(f"{BASE_URL}/api/tests/{tid}?practice=true", headers=auth_headers, timeout=20)
    assert r.status_code == 200, r.text[:200]
    detail = r.json()
    questions = detail.get("questions", [])
    assert len(questions) == 4, f"Expected 4 questions in test, got {len(questions)}: titles={[q.get('question_en') for q in questions]}"
    # Also expose for next tests
    return questions


# ----- BUG2: Option headers without (EN) read into options_en + empty strings for missing -----
def test_bug2_options_read_without_en_suffix(auth_headers, uploaded_test):
    sid = uploaded_test["series_id"]
    tests = _list_series_tests(auth_headers, sid)
    messy = [t for t in tests if t.get("title") == "Messy Mock A"][-1]
    tid = messy.get("test_id") or messy.get("id")
    r = requests.get(f"{BASE_URL}/api/tests/{tid}?practice=true", headers=auth_headers, timeout=20)
    assert r.status_code == 200
    questions = r.json().get("questions", [])
    # Q1: Capital of India? - all 4 options filled
    q1 = next(q for q in questions if "Capital of India" in (q.get("question_en") or ""))
    assert q1["options_en"] == ["Delhi", "Mumbai", "Kolkata", "Chennai"], q1["options_en"]
    assert q1["correct_index"] == 0  # 'A'
    # Q2: 2+2
    q2 = next(q for q in questions if "2+2" in (q.get("question_en") or ""))
    assert q2["options_en"] == ["3", "4", "5", "6"], q2["options_en"]
    assert q2["correct_index"] == 1  # 'B'


def test_bug2_two_option_row_pads_empty_strings(auth_headers, uploaded_test):
    """Row with only Option A/B must still produce options_en = ['Yes','No','',''] (4 slots)."""
    sid = uploaded_test["series_id"]
    tests = _list_series_tests(auth_headers, sid)
    messy = [t for t in tests if t.get("title") == "Messy Mock A"][-1]
    tid = messy.get("test_id") or messy.get("id")
    r = requests.get(f"{BASE_URL}/api/tests/{tid}?practice=true", headers=auth_headers, timeout=20)
    questions = r.json().get("questions", [])
    q3 = next(q for q in questions if "Only two options" in (q.get("question_en") or ""))
    assert len(q3["options_en"]) == 4, q3["options_en"]
    assert q3["options_en"][0] == "Yes"
    assert q3["options_en"][1] == "No"
    assert q3["options_en"][2] == "", f"Option C should be empty string, got {q3['options_en'][2]!r}"
    assert q3["options_en"][3] == "", f"Option D should be empty string, got {q3['options_en'][3]!r}"
    assert q3["correct_index"] == 0  # 'A' -> Yes


# ----- Regression: submit flow still works -----
def test_regression_submit_scoring(auth_headers, uploaded_test):
    sid = uploaded_test["series_id"]
    tests = _list_series_tests(auth_headers, sid)
    messy = [t for t in tests if t.get("title") == "Messy Mock A"][-1]
    tid = messy.get("test_id") or messy.get("id")
    # Submit with correct answers for all 4
    payload = {"answers": {"0": 0, "1": 1, "2": 0, "3": 1}, "time_taken_sec": 60, "mode": "practice"}
    r = requests.post(f"{BASE_URL}/api/tests/{tid}/submit", headers=auth_headers, json=payload, timeout=30)
    assert r.status_code == 200, f"submit {r.status_code}: {r.text[:300]}"
    body = r.json()
    assert "attempt_id" in body, body
