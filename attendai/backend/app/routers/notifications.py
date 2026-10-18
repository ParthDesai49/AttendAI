import os

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from .. import emailer
from ..database import get_db
from ..models import Employee, Notification
from ..schemas import NotificationOut
from ..security import current_user, require_roles

router = APIRouter(prefix="/api/notifications", tags=["Notifications"])
HR = require_roles("admin", "hr")


@router.get("")
def my_notifications(limit: int = Query(15, ge=1, le=50), db: Session = Depends(get_db), user: Employee = Depends(current_user)):
    """The bell: newest first, with the number still unread."""
    unread = db.scalar(select(func.count()).select_from(Notification).where(
        Notification.employee_id == user.id, Notification.is_read.is_(False)))
    items = db.scalars(select(Notification).where(Notification.employee_id == user.id)
                       .order_by(Notification.created_at.desc(), Notification.id.desc()).limit(limit)).all()
    return {"unread": unread, "items": [NotificationOut.model_validate(n) for n in items]}


@router.post("/read-all", status_code=204)
def read_all(db: Session = Depends(get_db), user: Employee = Depends(current_user)):
    db.execute(update(Notification).where(Notification.employee_id == user.id, Notification.is_read.is_(False)).values(is_read=True))
    db.commit()


@router.post("/{notification_id}/read", status_code=204)
def read_one(notification_id: int, db: Session = Depends(get_db), user: Employee = Depends(current_user)):
    n = db.get(Notification, notification_id)
    if not n or n.employee_id != user.id:
        raise HTTPException(404, "Notification not found")
    n.is_read = True
    db.commit()


@router.get("/email-status")
def email_status(user: Employee = Depends(HR)):
    mode = emailer.current_mode()
    return {"mode": mode, "from_address": emailer.from_address(), "host": os.getenv("SMTP_HOST") if mode == "smtp" else None}


@router.post("/test-email")
def test_email(user: Employee = Depends(HR)):
    """Sends a test message to the signed-in person and reports the real error if the mail server refuses it."""
    mode = emailer.current_mode()
    if mode == "off":
        raise HTTPException(400, "Email notifications are switched off (EMAIL_ENABLED=false)")
    try:
        emailer.deliver(user.email, *emailer.test_message(user.full_name))
    except Exception as exc:
        raise HTTPException(502, f"The mail server did not accept the message: {exc}")
    return {"mode": mode, "sent_to": user.email}
