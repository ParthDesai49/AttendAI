from calendar import monthrange
from datetime import date, datetime, timedelta
from math import asin, cos, radians, sin, sqrt
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import ENFORCE_WORK_HOURS, get_db
from ..models import Attendance, Employee, FaceTemplate, Holiday, LeaveRequest, OfficeLocation, Shift
from ..schemas import AttendanceOut, CheckInIn, FacePunchIn, PunchOut, QrPunchIn
from ..security import current_user, read_qr_token, require_roles
from .face import check_lock, check_vector, clear_fails, matches, record_fail

router = APIRouter(prefix="/api/attendance", tags=["Attendance"])
IST = ZoneInfo("Asia/Kolkata")
VIEWERS = require_roles("admin", "hr", "manager")


def distance_m(lat1, lon1, lat2, lon2) -> float:
    """Haversine distance in metres (used for geo-fenced check-in)."""
    p1, p2 = radians(lat1), radians(lat2)
    a = sin((p2 - p1) / 2) ** 2 + cos(p1) * cos(p2) * sin(radians(lon2 - lon1) / 2) ** 2
    return 2 * 6371000 * asin(sqrt(a))


def get_shift(db: Session, user: Employee) -> Shift:
    return user.shift or db.scalar(select(Shift).where(Shift.is_default.is_(True)))


def is_night(shift: Shift) -> bool:
    """A shift that ends at or before the time it starts runs past midnight (for example 22:00 to 06:00)."""
    return shift.end_time <= shift.start_time


def work_day(shift: Shift, now: datetime) -> date:
    """The day a shift belongs to is the day it started. At 01:30 a night worker is still on yesterday's shift."""
    return now.date() - timedelta(days=1) if is_night(shift) and now.time() < shift.end_time else now.date()


def shift_end(shift: Shift, work_date: date) -> datetime:
    end = datetime.combine(work_date, shift.end_time, tzinfo=IST)
    return end + timedelta(days=1) if is_night(shift) else end


def current_row(db: Session, user: Employee) -> Optional[Attendance]:
    """The attendance row the person is working on right now. For a night shift that can be last night's open row."""
    now, shift = datetime.now(IST), get_shift(db, user)
    if is_night(shift):
        open_row = db.scalar(select(Attendance).where(
            Attendance.employee_id == user.id, Attendance.work_date == now.date() - timedelta(days=1),
            Attendance.check_in.is_not(None), Attendance.check_out.is_(None)))
        if open_row:
            return open_row
    return db.scalar(select(Attendance).where(Attendance.employee_id == user.id, Attendance.work_date == work_day(shift, now)))


def score_row(row: Attendance, shift: Shift) -> None:
    """Works out late, worked, early-leave, overtime and status from the check-in and check-out times.
    Check-in, check-out and approved corrections all use this, so the rules cannot drift apart."""
    if row.check_in:
        start = datetime.combine(row.work_date, shift.start_time, tzinfo=IST)
        mins = int((row.check_in - start).total_seconds() // 60)
        row.late_minutes = mins if mins > shift.grace_minutes else 0
        row.status = "late" if row.late_minutes else "present"
    if row.check_in and row.check_out:
        worked = int((row.check_out - row.check_in).total_seconds() // 60)
        row.worked_minutes = worked
        row.early_leave_minutes = max(0, int((shift_end(shift, row.work_date) - row.check_out).total_seconds() // 60))
        row.overtime_minutes = max(0, worked - shift.full_day_minutes)
        if ENFORCE_WORK_HOURS:
            if worked < shift.half_day_minutes:
                row.status = "absent"
            elif worked < shift.full_day_minutes:
                row.status = "half_day"


def register_check_in(db: Session, user: Employee, method: str, mode: str, lat=None, lng=None, location_id=None) -> Attendance:
    """Creates the attendance row for this shift, with late minutes worked out from the employee's shift.
    Every check-in method (web, GPS, QR, face) ends up here, so the rules are the same for all of them."""
    now, shift = datetime.now(IST), get_shift(db, user)
    if current_row(db, user):
        raise HTTPException(400, "You have already checked in today")
    row = Attendance(employee_id=user.id, work_date=work_day(shift, now), check_in=now, check_in_method=method,
                     check_in_lat=lat, check_in_lng=lng, location_id=location_id, work_mode=mode)
    score_row(row, shift)
    db.add(row)
    try:
        db.commit()
    except IntegrityError:  # double-click / race: the DB unique constraint is the last line of defence
        db.rollback()
        raise HTTPException(400, "You have already checked in today")
    db.refresh(row)
    return row


@router.post("/check-in", response_model=AttendanceOut)
def check_in(body: CheckInIn, db: Session = Depends(get_db), user: Employee = Depends(current_user)):
    if current_row(db, user):
        raise HTTPException(400, "You have already checked in today")
    mode = body.work_mode or user.work_mode
    location_id = None
    if body.method == "geo" and mode != "wfh":
        if body.latitude is None or body.longitude is None:
            raise HTTPException(400, "Location is required for geo check-in")
        offices = db.scalars(select(OfficeLocation).where(OfficeLocation.is_active.is_(True))).all()
        if not offices:
            raise HTTPException(400, "No office location is configured")
        dist, office = min(
            ((distance_m(body.latitude, body.longitude, float(o.latitude), float(o.longitude)), o) for o in offices),
            key=lambda pair: pair[0])
        if dist > office.radius_m:
            raise HTTPException(403, f"You are {int(dist)} m from {office.name} (allowed {office.radius_m} m)")
        location_id = office.id
    return register_check_in(db, user, body.method, mode, body.latitude, body.longitude, location_id)


def register_check_out(db: Session, user: Employee, method: str) -> Attendance:
    row = current_row(db, user)
    if not row or not row.check_in:
        raise HTTPException(400, "Please check in first")
    if row.check_out:
        raise HTTPException(400, "You have already checked out today")
    row.check_out, row.check_out_method = datetime.now(IST), method
    score_row(row, get_shift(db, user))
    db.commit()
    db.refresh(row)
    return row


def punch(db: Session, user: Employee, method: str, mode: str, location_id=None) -> dict:
    """QR and face scans do both jobs: the first scan of the day checks in, the next one checks out."""
    row = current_row(db, user)
    if row is None:
        return {"action": "check_in", "attendance": register_check_in(db, user, method, mode, location_id=location_id)}
    if row.check_out is None:
        return {"action": "check_out", "attendance": register_check_out(db, user, method)}
    raise HTTPException(400, "You have already checked in and out today")


@router.post("/check-out", response_model=AttendanceOut)
def check_out(db: Session = Depends(get_db), user: Employee = Depends(current_user)):
    return register_check_out(db, user, "web")


@router.post("/qr-punch", response_model=PunchOut)
def qr_punch(body: QrPunchIn, db: Session = Depends(get_db), user: Employee = Depends(current_user)):
    """Scan the rotating QR code shown at the office. Being able to scan it means you are looking at the screen."""
    location_id = read_qr_token(body.token)
    return punch(db, user, "qr", "office", location_id)


@router.post("/face-punch", response_model=PunchOut)
def face_punch(body: FacePunchIn, db: Session = Depends(get_db), user: Employee = Depends(current_user)):
    """The browser sends the 128 numbers it computed from the face in front of the camera; we compare them with the enrolled ones."""
    check_lock("face", user.id)
    template = db.scalar(select(FaceTemplate).where(FaceTemplate.employee_id == user.id))
    if not template:
        raise HTTPException(400, "Set up Face ID first")
    if not matches(check_vector(body.descriptor), template.descriptor):
        record_fail("face", user.id)
        raise HTTPException(403, "We couldn't match your face. Try again in better light, or check in another way.")
    clear_fails("face", user.id)
    return punch(db, user, "face", body.work_mode or user.work_mode)


@router.get("/today", response_model=Optional[AttendanceOut])
def today(db: Session = Depends(get_db), user: Employee = Depends(current_user)):
    return current_row(db, user)


@router.get("/me", response_model=list[AttendanceOut])
def my_history(month: Optional[str] = Query(None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$", description="YYYY-MM"),
               db: Session = Depends(get_db), user: Employee = Depends(current_user)):
    now = datetime.now(IST)
    year, mon = map(int, month.split("-")) if month else (now.year, now.month)
    first, last = date(year, mon, 1), date(year, mon, monthrange(year, mon)[1])
    return db.scalars(select(Attendance).where(
        Attendance.employee_id == user.id, Attendance.work_date.between(first, last)
    ).order_by(Attendance.work_date.desc())).all()


def daily_rows(db: Session, user: Employee, day: date) -> list[dict]:
    """Everyone in scope for one day, including people who have not checked in."""
    stmt = select(Employee).where(Employee.status != "inactive").order_by(Employee.full_name)
    if user.role == "manager":
        stmt = stmt.where(Employee.manager_id == user.id)
    marked = {a.employee_id: a for a in db.scalars(select(Attendance).where(Attendance.work_date == day))}
    on_leave = set(db.scalars(select(LeaveRequest.employee_id).where(
        LeaveRequest.status == "approved", LeaveRequest.start_date <= day, LeaveRequest.end_date >= day)))
    off_day = "weekend" if day.weekday() >= 5 else (
        "holiday" if db.scalar(select(Holiday.id).where(Holiday.holiday_date == day, Holiday.is_optional.is_(False))) else None)
    rows = []
    for e in db.scalars(stmt).all():
        a = marked.get(e.id)
        rows.append({
            "employee_id": e.id, "employee_code": e.employee_code, "full_name": e.full_name,
            "department": e.department.name if e.department else None,
            "status": a.status if a else ("on_leave" if e.id in on_leave else (off_day or "not_marked")),
            "check_in": a.check_in if a else None, "check_out": a.check_out if a else None,
            "late_minutes": a.late_minutes if a else 0, "worked_minutes": a.worked_minutes if a else 0,
        })
    return rows


@router.get("/daily")
def daily(day: Optional[date] = None, db: Session = Depends(get_db), user: Employee = Depends(VIEWERS)):
    return daily_rows(db, user, day or datetime.now(IST).date())


@router.get("/stats")
def stats(db: Session = Depends(get_db), user: Employee = Depends(VIEWERS)):
    rows = daily_rows(db, user, datetime.now(IST).date())
    count = lambda *s: sum(1 for r in rows if r["status"] in s)
    return {"total": len(rows), "present": count("present", "late", "half_day"), "late": count("late"),
            "on_leave": count("on_leave"), "not_checked_in": count("not_marked", "absent")}


@router.get("/trend")
def trend(days: int = Query(14, ge=1, le=90), db: Session = Depends(get_db), user: Employee = Depends(VIEWERS)):
    """Headcount per working day split into on time / late / absent (feeds the dashboard chart)."""
    end = datetime.now(IST).date()
    start = end - timedelta(days=days - 1)
    stmt = (select(Attendance.work_date, Attendance.status, func.count())
            .join(Employee, Employee.id == Attendance.employee_id)
            .where(Attendance.work_date.between(start, end))
            .group_by(Attendance.work_date, Attendance.status))
    if user.role == "manager":
        stmt = stmt.where(Employee.manager_id == user.id)
    counts: dict = {}
    for d, status, n in db.execute(stmt):
        counts.setdefault(d, {})[status] = n
    out = []
    for i in range(days):
        d = start + timedelta(days=i)
        if d.weekday() >= 5:
            continue
        c = counts.get(d, {})
        out.append({"date": d.isoformat(), "present": c.get("present", 0) + c.get("half_day", 0),
                    "late": c.get("late", 0), "absent": c.get("absent", 0)})
    return out
