from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import emailer, notify
from ..database import get_db
from ..models import Employee, Holiday, LeaveBalance, LeaveRequest, LeaveType
from ..schemas import LeaveApply, LeaveOut, ReviewIn
from ..security import current_user, require_roles

router = APIRouter(prefix="/api/leave", tags=["Leave"])
APPROVERS = require_roles("admin", "hr", "manager")


def count_days(db: Session, start: date, end: date, half: bool) -> Decimal:
    """Working days only: weekends and fixed holidays are not charged to the balance."""
    if half:
        return Decimal("0.5")
    holidays = set(db.scalars(select(Holiday.holiday_date).where(
        Holiday.holiday_date.between(start, end), Holiday.is_optional.is_(False))))
    days = (start + timedelta(i) for i in range((end - start).days + 1))
    return Decimal(sum(1 for d in days if d.weekday() < 5 and d not in holidays))


def get_balance(db: Session, emp_id: int, type_id: int, year: int):
    return db.scalar(select(LeaveBalance).where(
        LeaveBalance.employee_id == emp_id, LeaveBalance.leave_type_id == type_id, LeaveBalance.year == year))


@router.get("/types")
def leave_types(db: Session = Depends(get_db), user: Employee = Depends(current_user)):
    return [{"id": t.id, "name": t.name, "code": t.code, "is_paid": t.is_paid}
            for t in db.scalars(select(LeaveType).order_by(LeaveType.id))]


@router.get("/balances")
def my_balances(db: Session = Depends(get_db), user: Employee = Depends(current_user)):
    rows = db.execute(
        select(LeaveType.name, LeaveType.code, LeaveBalance.allocated, LeaveBalance.used)
        .select_from(LeaveBalance).join(LeaveType, LeaveType.id == LeaveBalance.leave_type_id)
        .where(LeaveBalance.employee_id == user.id, LeaveBalance.year == date.today().year)).all()
    return [{"type": n, "code": c, "allocated": float(a), "used": float(u), "remaining": float(a - u)}
            for n, c, a, u in rows]


@router.post("", response_model=LeaveOut, status_code=201)
def apply(body: LeaveApply, background: BackgroundTasks, db: Session = Depends(get_db), user: Employee = Depends(current_user)):
    if body.end_date < body.start_date:
        raise HTTPException(400, "End date cannot be before start date")
    if body.is_half_day and body.start_date != body.end_date:
        raise HTTPException(400, "A half-day leave must be a single date")
    leave_type = db.get(LeaveType, body.leave_type_id)
    if not leave_type:
        raise HTTPException(404, "Leave type not found")
    days = count_days(db, body.start_date, body.end_date, body.is_half_day)
    if days == 0:
        raise HTTPException(400, "Selected dates are all weekends or holidays")
    if db.scalar(select(LeaveRequest.id).where(
            LeaveRequest.employee_id == user.id, LeaveRequest.status.in_(("pending", "approved")),
            LeaveRequest.start_date <= body.end_date, LeaveRequest.end_date >= body.start_date)):
        raise HTTPException(409, "You already have a leave request overlapping these dates")
    if leave_type.is_paid:
        bal = get_balance(db, user.id, leave_type.id, body.start_date.year)
        if not bal or bal.allocated - bal.used < days:
            raise HTTPException(400, f"Insufficient {leave_type.name} balance")
    req = LeaveRequest(employee_id=user.id, leave_type_id=leave_type.id, start_date=body.start_date,
                       end_date=body.end_date, is_half_day=body.is_half_day, days=days, reason=body.reason)
    db.add(req)
    # tell the manager; if there is none, tell HR and admins
    manager = db.get(Employee, user.manager_id) if user.manager_id else None
    approvers = [manager] if manager and manager.status != "inactive" else db.scalars(
        select(Employee).where(Employee.role.in_(("hr", "admin")), Employee.status != "inactive", Employee.id != user.id)).all()
    for a in approvers:
        notify.add(db, a.id, f"{user.full_name} asked for leave",
                   f"{leave_type.name}: {emailer.span(req.start_date, req.end_date, req.is_half_day)}", "/leave?tab=approvals")
    db.commit()
    db.refresh(req)
    for a in approvers:
        background.add_task(emailer.send_email, a.email, *emailer.leave_requested(
            a.full_name, user.full_name, leave_type.name, req.start_date, req.end_date, req.is_half_day, req.days, req.reason))
    return req


@router.get("/me", response_model=list[LeaveOut])
def my_requests(db: Session = Depends(get_db), user: Employee = Depends(current_user)):
    return db.scalars(select(LeaveRequest).where(LeaveRequest.employee_id == user.id)
                      .order_by(LeaveRequest.created_at.desc())).all()


@router.post("/{leave_id}/cancel", response_model=LeaveOut)
def cancel(leave_id: int, db: Session = Depends(get_db), user: Employee = Depends(current_user)):
    req = db.get(LeaveRequest, leave_id)
    if not req or req.employee_id != user.id:
        raise HTTPException(404, "Leave request not found")
    if req.status != "pending":
        raise HTTPException(400, "Only pending requests can be cancelled")
    req.status = "cancelled"
    db.commit()
    db.refresh(req)
    return req


@router.get("/pending")
def pending(db: Session = Depends(get_db), user: Employee = Depends(APPROVERS)):
    """Managers see their direct reports' requests; HR/Admin see everyone's."""
    q = (select(LeaveRequest, Employee.full_name, LeaveType.name)
         .join(Employee, Employee.id == LeaveRequest.employee_id)
         .join(LeaveType, LeaveType.id == LeaveRequest.leave_type_id)
         .where(LeaveRequest.status == "pending", LeaveRequest.employee_id != user.id)
         .order_by(LeaveRequest.created_at))
    if user.role == "manager":
        q = q.where(Employee.manager_id == user.id)
    return [{**LeaveOut.model_validate(r).model_dump(), "employee_name": n, "leave_type": t}
            for r, n, t in db.execute(q).all()]


@router.post("/{leave_id}/review", response_model=LeaveOut)
def review(leave_id: int, body: ReviewIn, background: BackgroundTasks, db: Session = Depends(get_db), user: Employee = Depends(APPROVERS)):
    req = db.get(LeaveRequest, leave_id)
    if not req:
        raise HTTPException(404, "Leave request not found")
    if req.status != "pending":
        raise HTTPException(400, "This request has already been reviewed")
    if req.employee_id == user.id:
        raise HTTPException(403, "You cannot review your own request")
    owner = db.get(Employee, req.employee_id)
    if user.role == "manager" and owner.manager_id != user.id:
        raise HTTPException(403, "This employee does not report to you")
    req.status = "approved" if body.approve else "rejected"
    req.reviewed_by, req.reviewed_at, req.review_note = user.id, datetime.now(timezone.utc), body.note
    if body.approve and db.get(LeaveType, req.leave_type_id).is_paid:
        bal = get_balance(db, req.employee_id, req.leave_type_id, req.start_date.year)
        if bal:
            bal.used += req.days
    leave_name = db.get(LeaveType, req.leave_type_id).name
    word = "approved" if body.approve else "rejected"
    notify.add(db, owner.id, f"Your leave was {word}",
               f"{leave_name}: {emailer.span(req.start_date, req.end_date, req.is_half_day)}" + (f". Note: {body.note}" if body.note else ""), "/leave")
    db.commit()
    db.refresh(req)
    background.add_task(emailer.send_email, owner.email, *emailer.leave_decided(
        owner.full_name, leave_name, req.start_date, req.end_date, req.is_half_day, req.days, body.approve, user.full_name, body.note))
    return req
