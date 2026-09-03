import uuid
from datetime import datetime, timezone

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select
from urllib.parse import parse_qs, urlparse
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

import api.routes as routes
from api.app import app
from api.auth import hash_token, upsert_oauth_user
from api.database import get_session
from api.settings import settings
from models.db import AuthSession, Base, QuizRun, User


@pytest.fixture
async def client(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "secret_key", "test-secret")
    monkeypatch.setattr(settings, "dev_auth", True)
    monkeypatch.setattr(settings, "cookie_secure", False)
    monkeypatch.setattr(settings, "raw_upload_dir", str(tmp_path / "raw"))

    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async def override_get_session():
        async with Session() as session:
            yield session

    app.dependency_overrides[get_session] = override_get_session
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac, Session
    app.dependency_overrides.clear()


async def _auth_cookies(session_factory, email="test@example.com"):
    async with session_factory() as session:
        user = await upsert_oauth_user(
            session,
            provider="github",
            provider_user_id=f"gh-{email}",
            email=email,
            display_name="Test User",
            avatar_url=None,
            email_verified=True,
        )
        token = "known-test-token"
        session.add(
            AuthSession(
                token_hash=hash_token(token),
                user_id=user.id,
                expires_at=datetime(2030, 1, 1, tzinfo=timezone.utc),
            )
        )
        await session.commit()
        return {"quiz_session": token}, user


async def test_me_anonymous(client):
    ac, _ = client
    res = await ac.get("/api/v1/me")
    assert res.status_code == 200
    assert res.json()["authenticated"] is False


async def test_sync_requires_auth(client):
    ac, _ = client
    run_id = uuid.uuid4()
    payload = {
        "runs": [
            {
                "id": str(run_id),
                "config": {"difficulty": "Mixed"},
                "attempts": [{"question_id": "q_abc", "is_correct": True}],
                "score": 1,
                "total": 1,
                "started_at": datetime.now(timezone.utc).isoformat(),
                "completed_at": datetime.now(timezone.utc).isoformat(),
            }
        ]
    }
    assert (await ac.post("/api/v1/sync", json=payload)).status_code == 401


async def test_sync_returns_synced_at(client):
    ac, Session = client
    cookies, _ = await _auth_cookies(Session)
    run_id = uuid.uuid4()
    payload = {
        "runs": [
            {
                "id": str(run_id),
                "config": {"difficulty": "Mixed"},
                "attempts": [],
                "score": 0,
                "total": 0,
                "started_at": datetime.now(timezone.utc).isoformat(),
                "completed_at": datetime.now(timezone.utc).isoformat(),
            }
        ]
    }
    res = await ac.post("/api/v1/sync", json=payload, cookies=cookies)
    assert res.status_code == 200
    body = res.json()
    assert body["synced"] == 1
    assert body["runs"][0]["synced_at"]


async def test_sync_idempotent(client):
    ac, Session = client
    cookies, _ = await _auth_cookies(Session)
    run_id = uuid.uuid4()
    payload = {
        "runs": [
            {
                "id": str(run_id),
                "config": {"difficulty": "Mixed"},
                "attempts": [{"question_id": "q1", "is_correct": True}],
                "score": 1,
                "total": 1,
                "started_at": datetime.now(timezone.utc).isoformat(),
                "completed_at": datetime.now(timezone.utc).isoformat(),
            }
        ]
    }
    assert (await ac.post("/api/v1/sync", json=payload, cookies=cookies)).status_code == 200
    assert (await ac.post("/api/v1/sync", json=payload, cookies=cookies)).status_code == 200

    async with Session() as session:
        count = await session.scalar(select(func.count()).select_from(QuizRun))
        assert count == 1


async def test_logout_clears_session(client):
    ac, Session = client
    cookies, _ = await _auth_cookies(Session)
    res = await ac.post("/api/v1/auth/logout", cookies=cookies)
    assert res.status_code == 200
    me = await ac.get("/api/v1/me", cookies=cookies)
    assert me.json()["authenticated"] is False


async def test_contribute_stores_raw(client):
    ac, Session = client
    cookies, _ = await _auth_cookies(Session)
    deck = {
        "retain": True,
        "schema_version": 1,
        "deck_name": "Test",
        "questions": [
            {
                "tags": ["cnn"],
                "difficulty": "easy",
                "stem": "What is a convolution layer used for?",
                "options": ["a", "b", "c", "d"],
                "answer_idx": 0,
                "explanation": "Conv layers extract spatial features.",
                "source": "Test",
            }
        ],
    }
    res = await ac.post("/api/v1/contribute", json=deck, cookies=cookies)
    assert res.status_code == 204


async def test_oauth_denial_redirect(client):
    ac, _ = client
    res = await ac.get("/api/v1/auth/github/callback?error=access_denied&state=x", follow_redirects=False)
    assert res.status_code == 302
    assert "auth_error=access_denied" in res.headers["location"]


async def test_delete_account(client):
    ac, Session = client
    cookies, user = await _auth_cookies(Session, "del@example.com")
    res = await ac.delete("/api/v1/account", cookies=cookies)
    assert res.status_code == 204
    async with Session() as session:
        assert await session.get(User, user.id) is None


def _run_payload(run_id, score=1):
    return {
        "runs": [
            {
                "id": str(run_id),
                "config": {"difficulty": "Mixed"},
                "attempts": [{"question_id": "q1", "is_correct": score == 1}],
                "score": score,
                "total": 1,
                "started_at": datetime.now(timezone.utc).isoformat(),
                "completed_at": datetime.now(timezone.utc).isoformat(),
            }
        ]
    }


async def test_oauth_callback_sets_cookie(client, monkeypatch):
    ac, _ = client

    async def fake_exchange(code):
        return {
            "provider_user_id": "gh-42",
            "email": "octo@example.com",
            "display_name": "Octo",
            "avatar_url": None,
            "email_verified": True,
        }

    monkeypatch.setattr(routes, "exchange_github", fake_exchange)

    start = await ac.post("/api/v1/auth/github/start")
    assert start.status_code == 200
    assert "oauth_nonce" in ac.cookies
    state = parse_qs(urlparse(start.json()["url"]).query)["state"][0]

    res = await ac.get(
        f"/api/v1/auth/github/callback?code=x&state={state}", follow_redirects=False
    )
    assert res.status_code == 302
    assert res.headers["location"] == "/"
    assert "quiz_session=" in res.headers.get("set-cookie", "")

    me = await ac.get("/api/v1/me")
    assert me.json()["authenticated"] is True


async def test_oauth_callback_rejects_missing_nonce(client, monkeypatch):
    ac, _ = client
    start = await ac.post("/api/v1/auth/github/start")
    state = parse_qs(urlparse(start.json()["url"]).query)["state"][0]
    ac.cookies.clear()
    res = await ac.get(
        f"/api/v1/auth/github/callback?code=x&state={state}", follow_redirects=False
    )
    assert res.status_code == 302
    assert "auth_error=oauth_failed" in res.headers["location"]


async def test_sync_cannot_overwrite_other_user(client):
    ac, Session = client
    cookies_a, user_a = await _auth_cookies(Session, "a@example.com")
    run_id = uuid.uuid4()
    assert (await ac.post("/api/v1/sync", json=_run_payload(run_id, 1), cookies=cookies_a)).status_code == 200

    async with Session() as session:
        user_b = await upsert_oauth_user(
            session,
            provider="github",
            provider_user_id="gh-b",
            email="b@example.com",
            display_name="B",
            avatar_url=None,
        )
        token_b = "other-token"
        session.add(
            AuthSession(
                token_hash=hash_token(token_b),
                user_id=user_b.id,
                expires_at=datetime(2030, 1, 1, tzinfo=timezone.utc),
            )
        )
        await session.commit()
    cookies_b = {"quiz_session": token_b}

    assert (await ac.post("/api/v1/sync", json=_run_payload(run_id, 0), cookies=cookies_b)).status_code == 200

    async with Session() as session:
        row = await session.get(QuizRun, run_id)
        assert row.user_id == user_a.id
        assert row.score == 1

    pull_b = await ac.get("/api/v1/sync", cookies=cookies_b)
    assert pull_b.json()["runs"] == []


async def test_sync_pull_bad_since_is_400(client):
    ac, Session = client
    cookies, _ = await _auth_cookies(Session)
    res = await ac.get("/api/v1/sync?since=garbage", cookies=cookies)
    assert res.status_code == 400
