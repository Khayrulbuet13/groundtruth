import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Request, Response
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from api.database import get_session
from api.rate_limit import client_ip
from api.settings import settings
from models.db import AuthSession, Identity, User

SESSION_COOKIE = "quiz_session"
SERIALIZER = URLSafeTimedSerializer(settings.secret_key, salt="oauth-state")


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def cookie_kwargs() -> dict:
    return {
        "httponly": True,
        "secure": settings.cookie_secure,
        "samesite": "lax",
        "path": "/",
    }


async def create_session(
    session: AsyncSession, user: User, request: Request, response: Response
) -> str:
    token = secrets.token_urlsafe(32)
    expires = datetime.now(timezone.utc) + timedelta(days=settings.session_ttl_days)
    session.add(
        AuthSession(
            token_hash=hash_token(token),
            user_id=user.id,
            expires_at=expires,
            user_agent=request.headers.get("user-agent"),
            ip=client_ip(request),
        )
    )
    await session.commit()
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=settings.session_ttl_days * 86400,
        **cookie_kwargs(),
    )
    return token


async def destroy_session(session: AsyncSession, request: Request, response: Response) -> None:
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        await session.execute(
            delete(AuthSession).where(AuthSession.token_hash == hash_token(token))
        )
        await session.commit()
    response.delete_cookie(SESSION_COOKIE, **cookie_kwargs())


async def destroy_all_sessions(session: AsyncSession, user_id: uuid.UUID) -> int:
    result = await session.execute(delete(AuthSession).where(AuthSession.user_id == user_id))
    await session.commit()
    return result.rowcount or 0


async def get_current_user(
    request: Request, session: AsyncSession = Depends(get_session)
) -> User | None:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return None
    row = await session.scalar(
        select(AuthSession).where(AuthSession.token_hash == hash_token(token))
    )
    if not row:
        return None
    expires = row.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    now = datetime.now(timezone.utc)
    if expires < now:
        await session.execute(
            delete(AuthSession).where(AuthSession.token_hash == hash_token(token))
        )
        await session.commit()
        return None
    return await session.scalar(
        select(User).where(User.id == row.user_id).options(selectinload(User.identities))
    )


async def require_user(user: User | None = Depends(get_current_user)) -> User:
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


def pack_oauth_state(provider: str, nonce: str) -> str:
    return SERIALIZER.dumps({"provider": provider, "nonce": nonce})


def unpack_oauth_state(state: str) -> dict:
    try:
        return SERIALIZER.loads(state, max_age=600)
    except SignatureExpired as exc:
        raise HTTPException(status_code=400, detail="OAuth state expired") from exc
    except BadSignature as exc:
        raise HTTPException(status_code=400, detail="Invalid OAuth state") from exc


async def upsert_oauth_user(
    session: AsyncSession,
    *,
    provider: str,
    provider_user_id: str,
    email: str,
    display_name: str,
    avatar_url: str | None,
    email_verified: bool = True,
) -> User:
    identity = await session.scalar(
        select(Identity).where(
            Identity.provider == provider, Identity.provider_user_id == provider_user_id
        )
    )
    if identity:
        user = await session.get(User, identity.user_id)
        if user:
            user.display_name = display_name
            user.avatar_url = avatar_url
            await session.commit()
            return user

    user = None
    if email_verified:
        user = await session.scalar(select(User).where(User.email == email))

    if not user:
        user = User(email=email, display_name=display_name, avatar_url=avatar_url)
        session.add(user)
        await session.flush()

    session.add(
        Identity(provider=provider, provider_user_id=provider_user_id, user_id=user.id)
    )
    await session.commit()
    await session.refresh(user)
    return user
