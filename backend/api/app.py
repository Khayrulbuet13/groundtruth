from contextlib import asynccontextmanager

from fastapi import FastAPI

from api.database import init_db
from api.rate_limit import RateLimitMiddleware
from api.routes import router
from api.settings import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    weak = settings.secret_key.startswith("change-me") or len(settings.secret_key) < 32
    if weak and not settings.dev_auth:
        raise RuntimeError("Set a long random SECRET_KEY before running in production (or enable DEV_AUTH for local)")
    await init_db()
    yield


app = FastAPI(title="Quiz API", lifespan=lifespan)
app.add_middleware(RateLimitMiddleware)
app.include_router(router)
