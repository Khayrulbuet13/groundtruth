import json
import secrets
import uuid
from datetime import datetime, timezone
from typing import Literal
from urllib.parse import quote, urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import (
    SESSION_COOKIE,
    cookie_kwargs,
    create_session,
    destroy_all_sessions,
    destroy_session,
    get_current_user,
    pack_oauth_state,
    require_user,
    unpack_oauth_state,
    upsert_oauth_user,
)
from api.database import get_session
from api.raw_store import store_raw_upload, unlink_user_from_manifest
from api.settings import settings
from models.db import QuestionReport, QuizRun, User

router = APIRouter(prefix="/api/v1")
ALLOWED_PROVIDERS = {"github", "google"}
NONCE_COOKIE = "oauth_nonce"


class RunPayload(BaseModel):
    id: uuid.UUID
    config: dict
    attempts: list
    score: int
    total: int
    started_at: datetime
    completed_at: datetime


class SyncPushBody(BaseModel):
    runs: list[RunPayload] = Field(max_length=200)


class ReportPayload(BaseModel):
    question_id: str = Field(max_length=64)
    reason: Literal["wrong_answer", "typo", "unclear", "other"]
    note: str | None = Field(default=None, max_length=1000)


def _redirect_auth_error(slug: str) -> Response:
    return Response(status_code=302, headers={"Location": f"/?auth_error={quote(slug)}"})


@router.get("/health")
async def health():
    return {"status": "ok", "dev_auth": settings.dev_auth}


@router.post("/auth/dev/login")
async def dev_login(
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
):
    if not settings.dev_auth:
        raise HTTPException(404, "Dev auth disabled")
    user = await upsert_oauth_user(
        session,
        provider="dev",
        provider_user_id="local-dev",
        email="dev@localhost",
        display_name="Local Dev",
        avatar_url=None,
        email_verified=True,
    )
    await create_session(session, user, request, response)
    return {"ok": True, "email": user.email}


@router.get("/me")
async def me(user: User | None = Depends(get_current_user)):
    if not user:
        return {"authenticated": False}
    provider = user.identities[0].provider if user.identities else None
    return {
        "authenticated": True,
        "id": str(user.id),
        "email": user.email,
        "display_name": user.display_name,
        "avatar_url": user.avatar_url,
        "provider": provider,
    }


@router.post("/auth/logout")
async def logout(
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
):
    await destroy_session(session, request, response)
    return {"ok": True}


@router.post("/auth/logout-all")
async def logout_all(
    request: Request,
    response: Response,
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    await destroy_all_sessions(session, user.id)
    response.delete_cookie(SESSION_COOKIE, **cookie_kwargs())
    return {"ok": True}


@router.delete("/account")
async def delete_account(
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    await session.delete(user)
    await session.commit()
    unlink_user_from_manifest(str(user.id))
    # Cookies must be set on the Response object we actually return.
    response = Response(status_code=204)
    response.delete_cookie(SESSION_COOKIE, **cookie_kwargs())
    return response


@router.post("/auth/{provider}/start")
async def auth_start(provider: str, response: Response):
    if provider not in ALLOWED_PROVIDERS:
        raise HTTPException(400, "Unsupported provider")
    # The nonce lives both in the signed state and in a short-lived cookie, so a
    # callback only completes in the browser that started the flow (login CSRF).
    nonce = secrets.token_urlsafe(16)
    state = pack_oauth_state(provider, nonce)
    response.set_cookie(NONCE_COOKIE, nonce, max_age=600, **cookie_kwargs())
    redirect_uri = f"{settings.base_url}/api/v1/auth/{provider}/callback"
    if provider == "github":
        base = "https://github.com/login/oauth/authorize"
        params = {
            "client_id": settings.github_client_id,
            "redirect_uri": redirect_uri,
            "scope": "read:user user:email",
            "state": state,
        }
    else:
        base = "https://accounts.google.com/o/oauth2/v2/auth"
        params = {
            "client_id": settings.google_client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
        }
    return {"url": f"{base}?{urlencode(params)}"}


async def exchange_github(code: str) -> dict:
    async with httpx.AsyncClient() as client:
        token_res = await client.post(
            "https://github.com/login/oauth/access_token",
            headers={"Accept": "application/json"},
            data={
                "client_id": settings.github_client_id,
                "client_secret": settings.github_client_secret,
                "code": code,
                "redirect_uri": f"{settings.base_url}/api/v1/auth/github/callback",
            },
        )
        token_res.raise_for_status()
        access = token_res.json().get("access_token")
        if not access:
            raise HTTPException(400, "oauth_failed")
        user_res = await client.get(
            "https://api.github.com/user",
            headers={"Authorization": f"Bearer {access}"},
        )
        user_res.raise_for_status()
        data = user_res.json()

        emails_res = await client.get(
            "https://api.github.com/user/emails",
            headers={"Authorization": f"Bearer {access}"},
        )
        emails_res.raise_for_status()
        emails = emails_res.json()
        verified = [e for e in emails if e.get("verified")]
        primary = next((e for e in verified if e.get("primary")), None)
        if primary:
            email = primary["email"]
            email_verified = True
        elif verified:
            email = verified[0]["email"]
            email_verified = True
        else:
            email = f"{data['id']}@users.noreply.github.com"
            email_verified = False

        return {
            "provider_user_id": str(data["id"]),
            "email": email,
            "display_name": data.get("name") or data.get("login") or email,
            "avatar_url": data.get("avatar_url"),
            "email_verified": email_verified,
        }


async def exchange_google(code: str) -> dict:
    async with httpx.AsyncClient() as client:
        token_res = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": f"{settings.base_url}/api/v1/auth/google/callback",
            },
        )
        token_res.raise_for_status()
        access = token_res.json()["access_token"]
        user_res = await client.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {access}"},
        )
        user_res.raise_for_status()
        data = user_res.json()
        if not data.get("email_verified"):
            raise HTTPException(400, "Google email not verified")
        return {
            "provider_user_id": data["sub"],
            "email": data["email"],
            "display_name": data.get("name") or data["email"],
            "avatar_url": data.get("picture"),
            "email_verified": True,
        }


@router.get("/auth/{provider}/callback")
async def auth_callback(
    provider: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
):
    if provider not in ALLOWED_PROVIDERS:
        return _redirect_auth_error("unsupported_provider")
    if error:
        return _redirect_auth_error(error)
    if not code or not state:
        return _redirect_auth_error("missing_code")

    try:
        payload = unpack_oauth_state(state)
        if payload.get("provider") != provider:
            return _redirect_auth_error("provider_mismatch")
        nonce = request.cookies.get(NONCE_COOKIE)
        if not nonce or payload.get("nonce") != nonce:
            return _redirect_auth_error("oauth_failed")
        exchanger = exchange_github if provider == "github" else exchange_google
        profile = await exchanger(code)
        user = await upsert_oauth_user(session, provider=provider, **profile)
        # FastAPI only merges cookies from the injected `response` when the handler
        # returns plain data, so the session cookie must go on the redirect itself.
        redirect = Response(status_code=302, headers={"Location": "/"})
        await create_session(session, user, request, redirect)
        redirect.delete_cookie(NONCE_COOKIE, **cookie_kwargs())
        return redirect
    except Exception:
        return _redirect_auth_error("oauth_failed")


@router.post("/sync")
async def sync_push(
    body: SyncPushBody,
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    results = []
    for run in body.runs:
        synced_at = datetime.now(timezone.utc)
        values = dict(
            id=run.id,
            user_id=user.id,
            config=run.config,
            attempts=run.attempts,
            score=run.score,
            total=run.total,
            started_at=run.started_at,
            completed_at=run.completed_at,
            synced_at=synced_at,
        )
        # On conflict only the owner may update the row; a foreign id is ignored.
        update = {k: v for k, v in values.items() if k not in ("id", "user_id")}
        insert = pg_insert if session.bind.dialect.name == "postgresql" else sqlite_insert
        stmt = insert(QuizRun).values(**values)
        stmt = stmt.on_conflict_do_update(
            index_elements=[QuizRun.id], set_=update, where=(QuizRun.user_id == user.id)
        )
        await session.execute(stmt)
        results.append({"id": str(run.id), "synced_at": synced_at.isoformat()})
    await session.commit()
    return {"synced": len(results), "runs": results}


@router.get("/sync")
async def sync_pull(
    since: str | None = None,
    limit: int = Query(default=500, ge=1, le=500),
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    q = select(QuizRun).where(QuizRun.user_id == user.id)
    if since:
        try:
            cursor = datetime.fromisoformat(since.replace("Z", "+00:00"))
        except ValueError as exc:
            raise HTTPException(400, "Invalid since") from exc
        q = q.where(QuizRun.synced_at > cursor)
    q = q.order_by(QuizRun.synced_at.asc()).limit(limit + 1)
    rows = (await session.scalars(q)).all()
    has_more = len(rows) > limit
    rows = rows[:limit]
    return {
        "runs": [
            {
                "id": str(r.id),
                "config": r.config,
                "attempts": r.attempts,
                "score": r.score,
                "total": r.total,
                "started_at": r.started_at.isoformat(),
                "completed_at": r.completed_at.isoformat(),
                "synced_at": r.synced_at.isoformat(),
            }
            for r in rows
        ],
        "has_more": has_more,
    }


@router.post("/reports")
async def report_question(
    body: ReportPayload,
    user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    session.add(
        QuestionReport(
            question_id=body.question_id,
            reason=body.reason,
            note=body.note,
            user_id=user.id if user else None,
        )
    )
    await session.commit()
    return {"ok": True}


@router.post("/contribute")
async def contribute(
    request: Request,
    user: User = Depends(require_user),
):
    body = await request.body()
    if not body:
        raise HTTPException(400, "Empty body")
    try:
        data = json.loads(body)
    except json.JSONDecodeError as exc:
        raise HTTPException(400, "Invalid JSON") from exc

    if not data.get("retain", True):
        return Response(status_code=204)

    deck_name = data.get("deck_name") or data.get("name") or "Untitled"
    questions = data.get("questions") or []
    try:
        store_raw_upload(
            user_id=str(user.id),
            body=body,
            deck_name=deck_name,
            question_count=len(questions),
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return Response(status_code=204)
