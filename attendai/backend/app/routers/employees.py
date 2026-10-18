import csv
import io
import secrets
from datetime import date
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import emailer, notify
from ..database import get_db
from ..models import Department, Employee, LeaveBalance, LeaveType, Shift
from ..schemas import DeptOut, EmployeeCreate, EmployeeOut, EmployeeUpdate, ImportIn, ResetPasswordIn, ShiftOut
from ..security import current_user, hash_password, require_roles

router = APIRouter(prefix="/api", tags=["Employees"])
HR = require_roles("admin", "hr")


@router.get("/employees", response_model=list[EmployeeOut])
def list_employees(q: Optional[str] = None, department_id: Optional[int] = None,
                   db: Session = Depends(get_db), user: Employee = Depends(require_roles("admin", "hr", "manager"))):
    stmt = select(Employee).order_by(Employee.full_name)
    if user.role == "manager":
        stmt = stmt.where(Employee.manager_id == user.id)
    if department_id:
        stmt = stmt.where(Employee.department_id == department_id)
    if q:
        stmt = stmt.where(Employee.full_name.ilike(f"%{q}%") | Employee.employee_code.ilike(f"%{q}%"))
    return db.scalars(stmt).all()


@router.post("/employees", response_model=EmployeeOut, status_code=201)
def create_employee(body: EmployeeCreate, background: BackgroundTasks, db: Session = Depends(get_db), user: Employee = Depends(HR)):
    if body.role == "admin" and user.role != "admin":
        raise HTTPException(403, "Only an admin can create another admin")
    exists = db.scalar(select(Employee.id).where(
        (func.lower(Employee.email) == body.email.lower()) | (Employee.employee_code == body.employee_code)))
    if exists:
        raise HTTPException(409, "Email or employee code already exists")
    data = body.model_dump(exclude={"password"})
    data["shift_id"] = data["shift_id"] or db.scalar(select(Shift.id).where(Shift.is_default.is_(True)))
    emp = Employee(**data, password_hash=hash_password(body.password))
    db.add(emp)
    db.flush()
    for lt in db.scalars(select(LeaveType).where(LeaveType.annual_quota > 0)):  # yearly leave quota
        db.add(LeaveBalance(employee_id=emp.id, leave_type_id=lt.id, year=date.today().year,
                            allocated=lt.annual_quota, used=0))
    db.commit()
    db.refresh(emp)
    background.add_task(emailer.send_email, emp.email, *emailer.welcome(emp.full_name, emp.email))
    return emp


ROLES = {"admin", "hr", "manager", "employee"}
MODES = {"office", "wfh", "hybrid"}
_email = TypeAdapter(EmailStr)
IMPORT_MAX_ROWS = 500


@router.post("/employees/import")
def import_employees(body: ImportIn, background: BackgroundTasks, db: Session = Depends(get_db), user: Employee = Depends(HR)):
    """Adds many people from CSV text. Columns: employee_code, full_name, email, date_of_joining (YYYY-MM-DD) are required;
    role, department, designation, work_mode, shift, manager_email, phone and password are optional.
    Rows with a problem are skipped and reported. With dry_run nothing is saved."""
    reader = csv.DictReader(io.StringIO(body.csv.strip().lstrip("\ufeff")))
    if not reader.fieldnames:
        raise HTTPException(400, "The file has no header row")
    reader.fieldnames = [(h or "").strip().lower().replace(" ", "_") for h in reader.fieldnames]
    missing = {"employee_code", "full_name", "email", "date_of_joining"} - set(reader.fieldnames)
    if missing:
        raise HTTPException(400, "Missing column(s): " + ", ".join(sorted(missing)))
    rows = list(reader)
    if not rows:
        raise HTTPException(400, "The file has no people in it")
    if len(rows) > IMPORT_MAX_ROWS:
        raise HTTPException(400, f"Import at most {IMPORT_MAX_ROWS} people at a time")

    depts = {d.name.lower(): d.id for d in db.scalars(select(Department))}
    shifts = {s_.name.lower(): s_.id for s_ in db.scalars(select(Shift))}
    default_shift = db.scalar(select(Shift.id).where(Shift.is_default.is_(True)))
    quotas = db.scalars(select(LeaveType).where(LeaveType.annual_quota > 0)).all()
    created, errors, made = [], [], []
    seen_codes, seen_emails = set(), set()
    for n, raw in enumerate(rows, start=2):  # row 1 is the header, so the first person is row 2
        r = {k: (v or "").strip() for k, v in raw.items() if k}
        try:
            code, name = r.get("employee_code", ""), r.get("full_name", "")
            if not code or not name:
                raise ValueError("employee_code and full_name are required")
            if len(code) > 20 or len(name) > 120:
                raise ValueError("employee_code (max 20) or full_name (max 120) is too long")
            try:
                email = str(_email.validate_python(r.get("email", ""))).lower()
            except ValidationError:
                raise ValueError(f"'{r.get('email', '')}' is not a valid email address")
            try:
                joined = date.fromisoformat(r.get("date_of_joining", ""))
            except ValueError:
                raise ValueError("date_of_joining must look like 2026-04-15")
            role = (r.get("role") or "employee").lower()
            if role not in ROLES:
                raise ValueError(f"role must be one of {', '.join(sorted(ROLES))}")
            if role == "admin" and user.role != "admin":
                raise ValueError("only an admin can create another admin")
            mode = (r.get("work_mode") or "office").lower()
            if mode not in MODES:
                raise ValueError("work_mode must be office, wfh or hybrid")
            dept_id = None
            if r.get("department"):
                dept_id = depts.get(r["department"].lower())
                if dept_id is None:
                    raise ValueError(f"team '{r['department']}' does not exist. Create it first")
            shift_id = default_shift
            if r.get("shift"):
                shift_id = shifts.get(r["shift"].lower())
                if shift_id is None:
                    raise ValueError(f"shift '{r['shift']}' does not exist")
            manager_id = None
            if r.get("manager_email"):
                manager_id = db.scalar(select(Employee.id).where(func.lower(Employee.email) == r["manager_email"].lower()))
                if manager_id is None:
                    raise ValueError(f"manager '{r['manager_email']}' was not found. List managers earlier in the file")
            password = r.get("password") or secrets.token_urlsafe(9)
            if len(password) < 8 or len(password) > 72:
                raise ValueError("password must be 8 to 72 characters")
            if code in seen_codes or email in seen_emails or db.scalar(select(Employee.id).where(
                    (func.lower(Employee.email) == email) | (Employee.employee_code == code))):
                raise ValueError("this employee code or email already exists")
            emp = Employee(employee_code=code, full_name=name, email=email, password_hash=hash_password(password), phone=r.get("phone") or None,
                           role=role, department_id=dept_id, manager_id=manager_id, shift_id=shift_id, designation=r.get("designation") or None,
                           work_mode=mode, date_of_joining=joined)
            db.add(emp)
            db.flush()
            for lt in quotas:
                db.add(LeaveBalance(employee_id=emp.id, leave_type_id=lt.id, year=date.today().year, allocated=lt.annual_quota, used=0))
            seen_codes.add(code)
            seen_emails.add(email)
            made.append(emp)
            created.append({"row": n, "employee_code": code, "full_name": name, "email": email, "temp_password": password})
        except ValueError as e:
            errors.append({"row": n, "message": str(e)})
    if body.dry_run:
        db.rollback()
    else:
        db.commit()
        for emp in made:
            background.add_task(emailer.send_email, emp.email, *emailer.welcome(emp.full_name, emp.email))
    return {"dry_run": body.dry_run, "created": created, "errors": errors}


@router.post("/employees/{emp_id}/reset-password", status_code=204)
def reset_password(emp_id: int, body: ResetPasswordIn, background: BackgroundTasks, db: Session = Depends(get_db), user: Employee = Depends(HR)):
    """HR sets a new password for someone who forgot theirs and tells them in person. They should change it after signing in."""
    emp = db.get(Employee, emp_id)
    if not emp:
        raise HTTPException(404, "Employee not found")
    if emp.role == "admin" and user.role != "admin":
        raise HTTPException(403, "Only an admin can reset an admin's password")
    emp.password_hash = hash_password(body.new_password)
    notify.add(db, emp.id, "Your password was reset", f"{user.full_name} set a new password on your account. Change it under Profile.", "/profile")
    db.commit()
    background.add_task(emailer.send_email, emp.email, *emailer.password_reset(emp.full_name, user.full_name))


@router.get("/employees/{emp_id}", response_model=EmployeeOut)
def get_employee(emp_id: int, db: Session = Depends(get_db), user: Employee = Depends(current_user)):
    emp = db.get(Employee, emp_id)
    if not emp:
        raise HTTPException(404, "Employee not found")
    if user.role == "employee" and user.id != emp_id:
        raise HTTPException(403, "You can only view your own profile")
    return emp


@router.patch("/employees/{emp_id}", response_model=EmployeeOut)
def update_employee(emp_id: int, body: EmployeeUpdate, db: Session = Depends(get_db), user: Employee = Depends(HR)):
    emp = db.get(Employee, emp_id)
    if not emp:
        raise HTTPException(404, "Employee not found")
    changes = body.model_dump(exclude_unset=True)
    if changes.get("role") == "admin" and user.role != "admin":
        raise HTTPException(403, "Only an admin can grant the admin role")
    for field, value in changes.items():
        setattr(emp, field, value)
    db.commit()
    db.refresh(emp)
    return emp


@router.get("/departments", response_model=list[DeptOut])
def departments(db: Session = Depends(get_db), user: Employee = Depends(current_user)):
    return db.scalars(select(Department).order_by(Department.name)).all()


@router.get("/shifts", response_model=list[ShiftOut])
def shifts(db: Session = Depends(get_db), user: Employee = Depends(current_user)):
    return db.scalars(select(Shift).order_by(Shift.start_time)).all()
