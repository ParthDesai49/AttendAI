"""Missed-punch corrections: forgot to check out, or the camera was down. The employee asks, a manager or HR decides.
An approved request rewrites the day's attendance row and the same scoring rules recalculate late, worked and overtime."""
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import emailer, notify
from ..database import get_db
from ..models import Attendance, Employee, Regularization
from ..schemas import CorrectionIn, CorrectionOut, ReviewIn
from ..security import current_user, require_roles
from .attendance import get_shift, is_night, score_row

router = APIRouter(prefix="/api/corrections", tags=["Corrections"])
APPROVERS = require_roles("admin", "hr", "manager")
IST = ZoneInfo("Asia/Kolkata")
LOOKBACK_DAYS = 31


@router.post("", response_model=CorrectionOut, status_code=201)
def request_correction(body: CorrectionIn, background: BackgroundTasks, db: Session = Depends(get_db), user: Employee = Depends(current_user)):
    today = datetime.now(IST).date()
    if body.work_date > today:
        raise HTTPException(400, "You can only correct days that have already happened")
    if body.work_date < today - timedelta(days=LOOKBACK_DAYS):
        raise HTTPException(400, f"Corrections are only accepted for the last {LOOKBACK_DAYS} days")
    if body.check_in is None and body.check_out is None:
        raise HTTPException(400, "Add the check-in time, the check-out time, or both")
    if db.scalar(select(Regularization.id).where(
            Regularization.employee_id == user.id, Regularization.work_date == body.work_date, Regularization.status == "pending")):
        raise HTTPException(409, "You already have a pending correction for this day")

    existing = db.scalar(select(Attendance).where(Attendance.employee_id == user.id, Attendance.work_date == body.work_date))
    ci = datetime.combine(body.work_date, body.check_in, tzinfo=IST) if body.check_in else None
    co = datetime.combine(body.work_date, body.check_out, tzinfo=IST) if body.check_out else None
    base_in = ci or (existing.check_in if existing else None)
    if co is not None:
        if base_in is None:
            raise HTTPException(400, "Add a check-in time too, because there is no check-in on that day")
        if co <= base_in:
            if is_night(get_shift(db, user)):
                co += timedelta(days=1)  # a night shift ends the next morning
            else:
                raise HTTPException(400, "Check-out must be after check-in")
    if ci is not None and existing and existing.check_out and co is None and ci >= existing.check_out:
        raise HTTPException(400, "Check-in must be before the check-out already recorded")
    if ci is not None and co is not None and (co - ci) > timedelta(hours=20):
        raise HTTPException(400, "That is more than 20 hours between check-in and check-out. Please check the times")

    req = Regularization(employee_id=user.id, work_date=body.work_date, requested_check_in=ci, requested_check_out=co, reason=body.reason.strip())
    db.add(req)
    manager = db.get(Employee, user.manager_id) if user.manager_id else None
    approvers = [manager] if manager and manager.status != "inactive" else db.scalars(
        select(Employee).where(Employee.role.in_(("hr", "admin")), Employee.status != "inactive", Employee.id != user.id)).all()
    for a in approvers:
        notify.add(db, a.id, f"{user.full_name} asked for an attendance correction", f"{emailer.span(body.work_date, body.work_date, False)}: {req.reason[:80]}", "/corrections?tab=approvals")
    db.commit()
    db.refresh(req)
    for a in approvers:
        background.add_task(emailer.send_email, a.email, *emailer.correction_requested(a.full_name, user.full_name, body.work_date, req.reason))
    return req


@router.get("/me", response_model=list[CorrectionOut])
def my_corrections(db: Session = Depends(get_db), user: Employee = Depends(current_user)):
    return db.scalars(select(Regularization).where(Regularization.employee_id == user.id).order_by(Regularization.created_at.desc()).limit(60)).all()


@router.post("/{req_id}/cancel", response_model=CorrectionOut)
def cancel(req_id: int, db: Session = Depends(get_db), user: Employee = Depends(current_user)):
    req = db.get(Regularization, req_id)
    if not req or req.employee_id != user.id:
        raise HTTPException(404, "Correction request not found")
    if req.status != "pending":
        raise HTTPException(400, "Only pending requests can be cancelled")
    req.status = "cancelled"
    db.commit()
    db.refresh(req)
    return req


@router.get("/pending")
def pending(db: Session = Depends(get_db), user: Employee = Depends(APPROVERS)):
    """Managers see their direct reports' requests; HR and admins see everyone's."""
    q = (select(Regularization, Employee.full_name).join(Employee, Employee.id == Regularization.employee_id)
         .where(Regularization.status == "pending", Regularization.employee_id != user.id).order_by(Regularization.created_at))
    if user.role == "manager":
        q = q.where(Employee.manager_id == user.id)
    out = []
    for r, name in db.execute(q).all():
        cur = db.scalar(select(Attendance).where(Attendance.employee_id == r.employee_id, Attendance.work_date == r.work_date))
        out.append({**CorrectionOut.model_validate(r).model_dump(), "employee_name": name,
                    "current_check_in": cur.check_in if cur else None, "current_check_out": cur.check_out if cur else None})
    return out


@router.post("/{req_id}/review", response_model=CorrectionOut)
def review(req_id: int, body: ReviewIn, background: BackgroundTasks, db: Session = Depends(get_db), user: Employee = Depends(APPROVERS)):
    req = db.get(Regularization, req_id)
    if not req:
        raise HTTPException(404, "Correction request not found")
    if req.status != "pending":
        raise HTTPException(400, "This request has already been reviewed")
    if req.employee_id == user.id:
        raise HTTPException(403, "You cannot review your own request")
    owner = db.get(Employee, req.employee_id)
    if user.role == "manager" and owner.manager_id != user.id:
        raise HTTPException(403, "This employee does not report to you")
    if body.approve:
        row = db.scalar(select(Attendance).where(Attendance.employee_id == owner.id, Attendance.work_date == req.work_date))
        if row is None:
            row = Attendance(employee_id=owner.id, work_date=req.work_date, work_mode=owner.work_mode)
            db.add(row)
        if req.requested_check_in:
            row.check_in, row.check_in_method = req.requested_check_in, "manual"
        if req.requested_check_out:
            row.check_out, row.check_out_method = req.requested_check_out, "manual"
        if row.check_in and row.check_out and row.check_out <= row.check_in:
            raise HTTPException(400, "The corrected times no longer make sense with what is recorded. Ask the employee to send a new request")
        score_row(row, get_shift(db, owner))
        row.notes = ((row.notes + " | ") if row.notes else "") + f"Corrected by {user.full_name} ({req.reason[:60]})"
    req.status = "approved" if body.approve else "rejected"
    req.reviewed_by, req.reviewed_at = user.id, datetime.now(timezone.utc)
    word = "approved" if body.approve else "rejected"
    notify.add(db, owner.id, f"Your correction was {word}", emailer.span(req.work_date, req.work_date, False) + (f". Note: {body.note}" if body.note else ""), "/corrections")
    db.commit()
    db.refresh(req)
    background.add_task(emailer.send_email, owner.email, *emailer.correction_decided(owner.full_name, req.work_date, body.approve, user.full_name))
    return req
