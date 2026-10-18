"""Password hashing, JWT tokens and role-based access dependencies."""
import hashlib
import hmac
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .database import QR_TOKEN_SECONDS, SECRET_KEY, TOKEN_MINUTES, get_db
from .models import Employee

bearer = HTTPBearer()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode()[:72], bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode()[:72], hashed.encode())


def create_token(emp: Employee) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=TOKEN_MINUTES)
    return jwt.encode({"sub": str(emp.id), "role": emp.role, "exp": exp}, SECRET_KEY, algorithm="HS256")


def current_user(cred: HTTPAuthorizationCredentials = Depends(bearer), db: Session = Depends(get_db)) -> Employee:
    try:
        data = jwt.decode(cred.credentials, SECRET_KEY, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid or expired token")
    emp = db.get(Employee, int(data["sub"]))
    if not emp or emp.status == "inactive":
        raise HTTPException(401, "Account not found or inactive")
    return emp


def require_roles(*roles: str):
    def checker(user: Employee = Depends(current_user)) -> Employee:
        if user.role not in roles:
            raise HTTPException(403, "You do not have permission for this action")
        return user
    return checker


# ---- Office QR codes: "<office id>.<expiry unix time>.<signature>", short so the QR stays easy to scan.
def _qr_sig(loc: int, exp: int) -> str:
    return hmac.new(SECRET_KEY.encode(), f"qr:{loc}.{exp}".encode(), hashlib.sha256).hexdigest()[:24]


def make_qr_token(location_id: Optional[int], seconds: int = QR_TOKEN_SECONDS) -> str:
    loc, exp = location_id or 0, int(time.time()) + seconds
    return f"{loc}.{exp}.{_qr_sig(loc, exp)}"


def read_qr_token(token: str) -> Optional[int]:
    """Returns the office id (or None) for a valid, unexpired code; raises 400 otherwise."""
    invalid = HTTPException(400, "This is not a valid AttendAI QR code")
    try:
        loc_s, exp_s, sig = token.strip().split(".")
        loc, exp = int(loc_s), int(exp_s)
    except ValueError:
        raise invalid
    if not hmac.compare_digest(sig, _qr_sig(loc, exp)):
        raise invalid
    if exp < time.time():
        raise HTTPException(400, "This QR code has expired. Scan the code that is showing on the screen now.")
    return loc or None
