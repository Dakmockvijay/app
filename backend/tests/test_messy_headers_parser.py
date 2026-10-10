"""Iteration 8 bug-fix regression: DakMock .xlsx parser must tolerate inconsistent
whitespace around parentheses in option headers.

Context: user's Excel had 'Option A (EN)'/'Option B (EN)' with a space and
'Option C(EN)'/'Option D(EN)' with NO space (same for HI). The fix in _normkey()
in /app/backend/server.py removes ALL whitespace so both variants match.

Covers:
    1. Bug: upload xlsx with mixed-spacing headers -> all 4 EN & all 4 HI options
       must come back on GET /api/tests/{id}?practice=true.
    2. Forward-fill: blank Test Name inherits the previous row's test.
    3. Correct Answer letter mapping: A->0, B->1, C->2, D->3.
    4. Regression: standard spaced headers 'Option C (EN)' still parses all 4.
"""
import os
import uuid
from io import BytesIO

import pandas as pd
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def admin_h(s):
    r = s.post(f"{API}/auth/login", json={"email": "admin@dakmock.com", "password": "Admin@123"})
    assert r.status_code == 200, r.text
    tok = r.json().get("session_token")
    assert tok, f"login response missing session_token: {r.text}"
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def series_id(s, admin_h):
    """gds_mts / is_free=true / mock bucket."""
    r = s.post(
        f"{API}/admin/ensure-series",
        headers=admin_h,
        json={"category_id": "gds_mts", "is_free": True, "series_type": "mock"},
    )
    assert r.status_code == 200, r.text
    return r.json()["series_id"]


# Collect every test title we create so we can delete them at the end.
_CREATED_TITLES: list[str] = []


def _upload(s, admin_h, df: pd.DataFrame) -> dict:
    buf = BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as w:
        df.to_excel(w, index=False, sheet_name="Questions")
    buf.seek(0)
    files = {"file": ("messy.xlsx", buf.getvalue(),
                      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    data = {"category_id": "gds_mts", "is_free": "true", "series_type": "mock"}
    r = s.post(f"{API}/admin/bulk-upload-tagged", headers=admin_h, files=files, data=data)
    assert r.status_code == 200, r.text
    return r.json()


def _find_test_id(s, admin_h, sid: str, title: str) -> str:
    r = s.get(f"{API}/admin/test-series/{sid}/tests", headers=admin_h)
    assert r.status_code == 200, r.text
    for t in r.json():
        if t["title"] == title:
            return t["test_id"]
    pytest.fail(f"Uploaded test '{title}' not found in series {sid}; got {r.json()}")


def _fetch_practice(s, admin_h, tid: str) -> dict:
    r = s.get(f"{API}/tests/{tid}?practice=true", headers=admin_h)
    assert r.status_code == 200, r.text
    return r.json()


# ---------- 1. Bug-fix: mixed-spacing headers ----------
class TestMixedSpacingHeaders:
    """Headers with inconsistent whitespace before '(' must still produce 4 options."""

    def test_mixed_spacing_all_4_options_en_and_hi(self, s, admin_h, series_id):
        title = f"TEST_messy_{uuid.uuid4().hex[:6]}"
        _CREATED_TITLES.append(title)
        # EXACT headers from the user's report: A/B spaced, C/D no space (EN);
        # A no space, B spaced, C/D no space (HI).
        rows = [{
            "Question Text (EN)": "Capital of India?",
            "Question Text (HI)": "भारत की राजधानी?",
            "Option A (EN)": "Mumbai",
            "Option B (EN)": "Kolkata",
            "Option C(EN)": "New Delhi",
            "Option D(EN)": "Chennai",
            "Option A(HI)": "मुंबई",
            "Option B (HI)": "कोलकाता",
            "Option C(HI)": "नई दिल्ली",
            "Option D(HI)": "चेन्नई",
            "Correct Answer": "C",
            "Exam Category": "gds_mts",
            "Test Name": title,
            "Time Limit (min)": 30,
            "Marks": 1,
        }, {
            "Question Text (EN)": "2 + 2 = ?",
            "Question Text (HI)": "2 + 2 = ?",
            "Option A (EN)": "3",
            "Option B (EN)": "4",
            "Option C(EN)": "5",
            "Option D(EN)": "22",
            "Option A(HI)": "३",
            "Option B (HI)": "४",
            "Option C(HI)": "५",
            "Option D(HI)": "२२",
            "Correct Answer": "B",
            "Exam Category": "gds_mts",
            "Test Name": "",            # Bug 1: forward-fill
            "Time Limit (min)": "",
            "Marks": 1,
        }]
        df = pd.DataFrame(rows)
        res = _upload(s, admin_h, df)
        assert res["tests_created"] >= 1
        assert res["questions_created"] == 2, res

        tid = _find_test_id(s, admin_h, series_id, title)
        data = _fetch_practice(s, admin_h, tid)
        qs = data["questions"]
        assert len(qs) == 2, f"forward-fill failed: expected 2 questions, got {len(qs)}"

        q0 = qs[0]
        # ---- the actual bug under test ----
        assert len(q0["options_en"]) == 4, q0
        assert all(o.strip() for o in q0["options_en"]), (
            f"EN options still empty with messy headers: {q0['options_en']}"
        )
        assert q0["options_en"] == ["Mumbai", "Kolkata", "New Delhi", "Chennai"], q0["options_en"]
        assert len(q0["options_hi"]) == 4, q0
        assert all(o.strip() for o in q0["options_hi"]), (
            f"HI options still empty with messy headers: {q0['options_hi']}"
        )
        assert q0["options_hi"] == ["मुंबई", "कोलकाता", "नई दिल्ली", "चेन्नई"], q0["options_hi"]
        # Correct Answer letter mapping C -> 2
        assert q0["correct_index"] == 2, f"C must map to index 2, got {q0['correct_index']}"

        # Forward-filled row must also carry 4 EN + 4 HI, and B -> 1
        q1 = qs[1]
        assert all(o.strip() for o in q1["options_en"]), q1["options_en"]
        assert all(o.strip() for o in q1["options_hi"]), q1["options_hi"]
        assert q1["correct_index"] == 1, f"B must map to index 1, got {q1['correct_index']}"


# ---------- 2. Correct Answer letter mapping (A/B/C/D) ----------
class TestCorrectAnswerMapping:
    @pytest.mark.parametrize("letter,expected_idx", [("A", 0), ("B", 1), ("C", 2), ("D", 3)])
    def test_letter_maps_to_index(self, s, admin_h, series_id, letter, expected_idx):
        title = f"TEST_ans_{letter}_{uuid.uuid4().hex[:5]}"
        _CREATED_TITLES.append(title)
        df = pd.DataFrame([{
            "Question Text (EN)": f"Pick option {letter}",
            "Question Text (HI)": f"विकल्प {letter} चुनें",
            "Option A (EN)": "alpha",
            "Option B (EN)": "beta",
            "Option C(EN)": "gamma",
            "Option D(EN)": "delta",
            "Option A(HI)": "अल्फा",
            "Option B (HI)": "बीटा",
            "Option C(HI)": "गामा",
            "Option D(HI)": "डेल्टा",
            "Correct Answer": letter,
            "Exam Category": "gds_mts",
            "Test Name": title,
            "Time Limit (min)": 20,
            "Marks": 1,
        }])
        _upload(s, admin_h, df)
        tid = _find_test_id(s, admin_h, series_id, title)
        data = _fetch_practice(s, admin_h, tid)
        assert data["questions"][0]["correct_index"] == expected_idx


# ---------- 3. Regression: standard spaced headers still work ----------
class TestStandardSpacedHeadersRegression:
    """'Option C (EN)' with space must still produce 4 non-empty options."""

    def test_standard_headers_parse_all_4_options(self, s, admin_h, series_id):
        title = f"TEST_std_{uuid.uuid4().hex[:6]}"
        _CREATED_TITLES.append(title)
        df = pd.DataFrame([{
            "Question Text (EN)": "Largest planet?",
            "Question Text (HI)": "सबसे बड़ा ग्रह?",
            "Option A (EN)": "Earth",
            "Option B (EN)": "Mars",
            "Option C (EN)": "Jupiter",
            "Option D (EN)": "Saturn",
            "Option A (HI)": "पृथ्वी",
            "Option B (HI)": "मंगल",
            "Option C (HI)": "बृहस्पति",
            "Option D (HI)": "शनि",
            "Correct Answer": "C",
            "Exam Category": "gds_mts",
            "Test Name": title,
            "Time Limit (min)": 30,
            "Marks": 1,
        }])
        _upload(s, admin_h, df)
        tid = _find_test_id(s, admin_h, series_id, title)
        data = _fetch_practice(s, admin_h, tid)
        q = data["questions"][0]
        assert q["options_en"] == ["Earth", "Mars", "Jupiter", "Saturn"], q["options_en"]
        assert q["options_hi"] == ["पृथ्वी", "मंगल", "बृहस्पति", "शनि"], q["options_hi"]
        assert q["correct_index"] == 2


# ---------- cleanup ----------
def _delete_by_title(s, admin_h, title: str) -> None:
    """Find any test created with the given title under the gds_mts/is_free/mock
    series and soft-delete it via the admin API."""
    sid_r = s.post(f"{API}/admin/ensure-series", headers=admin_h,
                   json={"category_id": "gds_mts", "is_free": True, "series_type": "mock"})
    if sid_r.status_code != 200:
        return
    sid = sid_r.json()["series_id"]
    lst = s.get(f"{API}/admin/test-series/{sid}/tests", headers=admin_h)
    if lst.status_code != 200:
        return
    for t in lst.json():
        if t["title"] == title:
            s.delete(f"{API}/admin/tests/{t['test_id']}", headers=admin_h)


@pytest.fixture(scope="module", autouse=True)
def _teardown(s, admin_h):
    yield
    for title in list(_CREATED_TITLES):
        try:
            _delete_by_title(s, admin_h, title)
        except Exception as e:
            print(f"cleanup failed for {title}: {e}")
