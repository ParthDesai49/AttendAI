"""A tiny in-memory attempt counter, used to slow down password guessing.
It lives in one server process and resets on restart, which is fine for a single small server. A bigger deployment would keep this in Redis."""
import time
from typing import Optional

from fastapi import HTTPException, Request

_hits: dict[str, list[float]] = {}


def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")  # behind Render / Vercel the real address is the first entry
    return (fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "?"))


def check(key: str, limit: int, window: int, what: str = "attempts") -> None:
    now = time.time()
    recent = [t for t in _hits.get(key, []) if now - t < window]
    _hits[key] = recent
    if len(recent) >= limit:
        wait = int((window - (now - recent[0])) // 60) + 1
        raise HTTPException(429, f"Too many failed {what}. Try again in {wait} min.")


def fail(key: str) -> None:
    _hits.setdefault(key, []).append(time.time())


def clear(key: str) -> None:
    _hits.pop(key, None)


def reset_all(prefix: Optional[str] = None) -> None:  # used by the tests
    for k in [k for k in _hits if prefix is None or k.startswith(prefix)]:
        _hits.pop(k, None)
