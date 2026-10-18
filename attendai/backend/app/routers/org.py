"""Shifts and departments (teams): HR and admins manage them here instead of in the database."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Department, Employee, Shift
from ..schemas import DeptIn, DeptOut, ShiftIn, ShiftOut, ShiftUpdate
from ..security import require_roles

router = APIRouter(prefix="/api", tags=["Shifts and teams"])
HR = require_roles("admin", "hr")


def _check_shift(name, start, end, half, full):
    if start == end:
        raise HTTPException(400, "A shift cannot start and end at the same time")
    if half >= full:
        raise HTTPException(400, "Half-day minutes must be less than full-day minutes")


@router.get("/shifts/usage", dependencies=[Depends(HR)])
def shift_usage(db: Session = Depends(get_db)):
    return {str(i): n for i, n in db.execute(select(Employee.shift_id, func.count()).group_by(Employee.shift_id)).all() if i}


@router.post("/shifts", response_model=ShiftOut, status_code=201, dependencies=[Depends(HR)])
def create_shift(body: ShiftIn, db: Session = Depends(get_db)):
    _check_shift(body.name, body.start_time, body.end_time, body.half_day_minutes, body.full_day_minutes)
    if db.scalar(select(Shift.id).where(func.lower(Shift.name) == body.name.strip().lower())):
        raise HTTPException(409, "A shift with this name already exists")
    shift = Shift(**body.model_dump(), is_default=False)
    shift.name = body.name.strip()
    db.add(shift)
    db.commit()
    db.refresh(shift)
    return shift


@router.patch("/shifts/{shift_id}", response_model=ShiftOut, dependencies=[Depends(HR)])
def update_shift(shift_id: int, body: ShiftUpdate, db: Session = Depends(get_db)):
    shift = db.get(Shift, shift_id)
    if not shift:
        raise HTTPException(404, "Shift not found")
    changes = body.model_dump(exclude_unset=True)
    is_default = changes.pop("is_default", None)
    for k, v in changes.items():
        setattr(shift, k, v)
    _check_shift(shift.name, shift.start_time, shift.end_time, shift.half_day_minutes, shift.full_day_minutes)
    if "name" in changes and db.scalar(select(Shift.id).where(func.lower(Shift.name) == shift.name.strip().lower(), Shift.id != shift.id)):
        raise HTTPException(409, "A shift with this name already exists")
    if is_default is True:
        db.execute(update(Shift).values(is_default=False))
        shift.is_default = True
    elif is_default is False and shift.is_default:
        raise HTTPException(400, "Pick another shift as the default instead")
    db.commit()
    db.refresh(shift)
    return shift


@router.delete("/shifts/{shift_id}", status_code=204, dependencies=[Depends(HR)])
def delete_shift(shift_id: int, db: Session = Depends(get_db)):
    shift = db.get(Shift, shift_id)
    if not shift:
        raise HTTPException(404, "Shift not found")
    if shift.is_default:
        raise HTTPException(400, "The default shift cannot be deleted. Make another shift the default first")
    n = db.scalar(select(func.count()).select_from(Employee).where(Employee.shift_id == shift_id))
    if n:
        raise HTTPException(409, f"{n} {'person is' if n == 1 else 'people are'} on this shift. Move them first")
    db.delete(shift)
    db.commit()


@router.get("/departments/usage", dependencies=[Depends(HR)])
def dept_usage(db: Session = Depends(get_db)):
    return {str(i): n for i, n in db.execute(select(Employee.department_id, func.count()).group_by(Employee.department_id)).all() if i}


@router.post("/departments", response_model=DeptOut, status_code=201, dependencies=[Depends(HR)])
def create_department(body: DeptIn, db: Session = Depends(get_db)):
    if db.scalar(select(Department.id).where(func.lower(Department.name) == body.name.strip().lower())):
        raise HTTPException(409, "A team with this name already exists")
    dept = Department(name=body.name.strip(), description=body.description)
    db.add(dept)
    db.commit()
    db.refresh(dept)
    return dept


@router.patch("/departments/{dept_id}", response_model=DeptOut, dependencies=[Depends(HR)])
def update_department(dept_id: int, body: DeptIn, db: Session = Depends(get_db)):
    dept = db.get(Department, dept_id)
    if not dept:
        raise HTTPException(404, "Team not found")
    if db.scalar(select(Department.id).where(func.lower(Department.name) == body.name.strip().lower(), Department.id != dept_id)):
        raise HTTPException(409, "A team with this name already exists")
    dept.name, dept.description = body.name.strip(), body.description
    db.commit()
    db.refresh(dept)
    return dept


@router.delete("/departments/{dept_id}", status_code=204, dependencies=[Depends(HR)])
def delete_department(dept_id: int, db: Session = Depends(get_db)):
    dept = db.get(Department, dept_id)
    if not dept:
        raise HTTPException(404, "Team not found")
    n = db.scalar(select(func.count()).select_from(Employee).where(Employee.department_id == dept_id))
    if n:
        raise HTTPException(409, f"{n} {'person is' if n == 1 else 'people are'} in this team. Move them first")
    db.delete(dept)
    db.commit()
