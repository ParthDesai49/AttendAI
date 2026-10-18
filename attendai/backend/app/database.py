"""Settings + SQLAlchemy engine/session."""
import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+psycopg2://postgres:postgres@localhost:5432/attendai")
# Hosted databases (Neon, Render, Supabase) give "postgres://" or "postgresql://" URLs; SQLAlchemy needs the driver named.
for _prefix in ("postgres://", "postgresql://"):
    if DATABASE_URL.startswith(_prefix):
        DATABASE_URL = "postgresql+psycopg2://" + DATABASE_URL[len(_prefix):]
SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-me")
TOKEN_MINUTES = int(os.getenv("TOKEN_MINUTES", "480"))
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
ENFORCE_WORK_HOURS = os.getenv("ENFORCE_WORK_HOURS", "false").lower() == "true"
APP_URL = os.getenv("APP_URL", "http://localhost:5173").rstrip("/")  # used for links in emails
QR_TOKEN_SECONDS = int(os.getenv("QR_TOKEN_SECONDS", "45"))  # how long one office QR code stays valid
FACE_MATCH_THRESHOLD = float(os.getenv("FACE_MATCH_THRESHOLD", "0.5"))  # lower = stricter (face-api distance)

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def ensure_schema() -> None:
    """Idempotent upgrade for databases created from an older schema.sql:
    adds the 'face' check-in method, the face_templates and regularizations tables and notifications.link when they are missing."""
    from . import models
    try:
        with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
            conn.execute(text("ALTER TYPE check_method ADD VALUE IF NOT EXISTS 'face'"))
            conn.execute(text("ALTER TABLE notifications ADD COLUMN IF NOT EXISTS link VARCHAR(200)"))
        Base.metadata.create_all(engine, tables=[models.FaceTemplate.__table__, models.Regularization.__table__])
    except Exception as exc:  # the app still starts; face features will report their own errors
        print(f"[AttendAI] schema upgrade skipped: {exc}")
