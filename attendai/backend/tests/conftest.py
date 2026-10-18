"""Test setup. The tests run against a real PostgreSQL database, because the app relies on enums, arrays and constraints.

WARNING: the database named in TEST_DATABASE_URL is wiped and rebuilt from database/schema.sql at the start of every run.
Use an empty throwaway database, for example:   createdb -U postgres attendai_test
    set TEST_DATABASE_URL=postgresql+psycopg2://postgres:<password>@localhost:5432/attendai_test
    pytest
"""
import os
import pathlib
import sys
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import pytest

URL = os.getenv("TEST_DATABASE_URL")
if not URL:
    raise pytest.UsageError("Set TEST_DATABASE_URL to an empty throwaway PostgreSQL database (it will be wiped). See tests/conftest.py")
from sqlalchemy.engine import make_url  # noqa: E402

if "test" not in (make_url(URL).database or "").lower():
    raise pytest.UsageError("For safety the test database name must contain 'test' (for example attendai_test)")

os.environ["DATABASE_URL"] = URL
os.environ.pop("SMTP_HOST", None)  # emails go to console mode unless a test captures them
os.environ["SECRET_KEY"] = "test-secret-key-not-for-production"
ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app import emailer, throttle  # noqa: E402
from app.database import engine  # noqa: E402
from app.main import app  # noqa: E402
from app.routers import attendance, corrections, face  # noqa: E402

IST = ZoneInfo("Asia/Kolkata")
PASSWORD = "Demo@1234"


@pytest.fixture(scope="session")
def client():
    with engine.begin() as conn:
        conn.exec_driver_sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
        conn.exec_driver_sql((ROOT / "database" / "schema.sql").read_text())
    from scripts import seed
    seed.main()
    with TestClient(app) as c:  # entering the client runs the startup schema upgrade too
        yield c


@pytest.fixture(autouse=True)
def clean(client):
    """Every test starts with no attendance for the last few days and no lockout counters."""
    with engine.begin() as conn:
        conn.execute(text("DELETE FROM attendance WHERE work_date >= current_date - 3 OR work_date BETWEEN '2026-05-01' AND '2026-05-31'"))
        conn.execute(text("DELETE FROM notifications"))
    throttle.reset_all()
    face._fails.clear()
    yield


_tokens: dict[str, str] = {}


@pytest.fixture
def auth(client):
    def headers(email: str):
        if email not in _tokens:
            r = client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
            assert r.status_code == 200, r.text
            _tokens[email] = r.json()["access_token"]
        return {"Authorization": "Bearer " + _tokens[email]}
    return headers


@pytest.fixture
def admin(auth): return auth("admin@attendai.com")
@pytest.fixture
def hr(auth): return auth("hr@attendai.com")
@pytest.fixture
def manager(auth): return auth("manager@attendai.com")
@pytest.fixture
def neha(auth): return auth("neha@attendai.com")
@pytest.fixture
def karan(auth): return auth("karan@attendai.com")


@pytest.fixture
def outbox(monkeypatch):
    """Captures every email instead of sending it."""
    sent = []
    monkeypatch.setattr(emailer, "deliver", lambda to, subject, text, html=None: sent.append({"to": to, "subject": subject, "text": text, "html": html}))
    return sent


@pytest.fixture
def freeze(monkeypatch):
    """freeze(datetime(2026, 5, 4, 22, 10, tzinfo=IST)) makes the attendance code believe it is that moment."""
    def apply(moment: datetime):
        class Frozen(datetime):
            @classmethod
            def now(cls, tz=None):
                return moment.astimezone(tz) if tz else moment
        for module in (attendance, corrections):
            monkeypatch.setattr(module, "datetime", Frozen)
    return apply


def ist(y, m, d, hh=0, mm=0):
    return datetime(y, m, d, hh, mm, tzinfo=IST)


def employee_id(client, headers, email):
    return next(e["id"] for e in client.get("/api/employees", headers=headers).json() if e["email"] == email)


def last_weekday(days_ago=1):
    d = date.today() - timedelta(days=days_ago)
    while d.weekday() >= 5:
        d -= timedelta(days=1)
    return d
