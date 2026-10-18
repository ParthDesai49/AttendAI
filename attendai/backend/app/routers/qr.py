from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import QR_TOKEN_SECONDS, get_db
from ..models import Employee, OfficeLocation
from ..security import make_qr_token, require_roles

router = APIRouter(prefix="/api/qr", tags=["QR check-in"])


@router.get("/token")
def office_token(db: Session = Depends(get_db), user: Employee = Depends(require_roles("admin", "hr"))):
    """A short-lived signed code for the screen at the office door. The page asks for a new one every few seconds."""
    office = db.scalar(select(OfficeLocation).where(OfficeLocation.is_active.is_(True)).order_by(OfficeLocation.id))
    if not office:
        raise HTTPException(400, "Add an office location first")
    return {"token": make_qr_token(office.id), "expires_in": QR_TOKEN_SECONDS, "office": office.name}
