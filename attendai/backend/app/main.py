from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import CORS_ORIGINS, SECRET_KEY, ensure_schema
from .routers import analytics, attendance, auth, corrections, employees, face, holidays, leave, notifications, org, qr, reports

@asynccontextmanager
async def lifespan(_app: FastAPI):
    if SECRET_KEY == "dev-secret-change-me":
        print("[AttendAI] WARNING: SECRET_KEY is still the default. Set your own in .env before sharing this app.")
    ensure_schema()
    yield


app = FastAPI(
    lifespan=lifespan,
    title="AttendAI API",
    version="1.0.0",
    description="Attendance & leave management for IT companies. Click Authorize and paste the token from /api/auth/login.",
)
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])

for r in (auth.router, employees.router, attendance.router, leave.router, holidays.router, reports.router, analytics.router,
          qr.router, face.router, notifications.router, corrections.router, org.router):
    app.include_router(r)


@app.get("/api/health", tags=["System"])
def health():
    return {"status": "ok"}
