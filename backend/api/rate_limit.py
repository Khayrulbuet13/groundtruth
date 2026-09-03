from collections import defaultdict
from time import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse


def client_ip(request: Request) -> str:
    # nginx appends the real client to X-Forwarded-For, so the last entry is the
    # one we trust; the first can be spoofed by the client.
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[-1].strip()
    real = request.headers.get("x-real-ip")
    if real:
        return real.strip()
    return request.client.host if request.client else "unknown"


class RateLimitMiddleware(BaseHTTPMiddleware):
    """In-process rate limiter — no Redis in v1."""

    def __init__(self, app, limit: int = 120, window: int = 60):
        super().__init__(app)
        self.limit = limit
        self.window = window
        self.hits: dict[str, list[float]] = defaultdict(list)

    async def dispatch(self, request: Request, call_next):
        if not request.url.path.startswith("/api/"):
            return await call_next(request)
        key = client_ip(request)
        now = time()
        recent = [t for t in self.hits[key] if now - t < self.window]
        if len(recent) >= self.limit:
            self.hits[key] = recent
            return JSONResponse({"detail": "Rate limit exceeded"}, status_code=429)
        recent.append(now)
        self.hits[key] = recent
        # Drop idle keys so the dict does not grow forever.
        for k in [k for k, v in self.hits.items() if not v or now - v[-1] >= self.window]:
            del self.hits[k]
        return await call_next(request)
