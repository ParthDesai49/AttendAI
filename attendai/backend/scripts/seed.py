"""Seed demo users + 30 days of attendance.   Run from /backend:  python -m scripts.seed"""
import random
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select

from app.database import SessionLocal
from app.models import Attendance, Department, Employee, LeaveBalance, LeaveType, Shift
from app.security import hash_password

IST = ZoneInfo("Asia/Kolkata")
PASSWORD = "Demo@1234"
PEOPLE = [  # manager must come before the people who report to them
    ("EMP001", "Aarav Mehta", "admin@attendai.com", "admin", "HR & Admin", "Founder & Admin"),
    ("EMP002", "Priya Shah", "hr@attendai.com", "hr", "HR & Admin", "HR Manager"),
    ("EMP003", "Rohan Patel", "manager@attendai.com", "manager", "Engineering", "Engineering Manager"),
    ("EMP004", "Neha Joshi", "neha@attendai.com", "employee", "Engineering", "Full Stack Developer"),
    ("EMP005", "Karan Desai", "karan@attendai.com", "employee", "Engineering", "Backend Developer"),
    ("EMP006", "Isha Trivedi", "isha@attendai.com", "employee", "Engineering", "QA Engineer"),
    ("EMP007", "Dev Parmar", "dev@attendai.com", "employee", "Data & Analytics", "Data Analyst"),
    ("EMP008", "Meera Nair", "meera@attendai.com", "employee", "Data & Analytics", "Data Scientist"),
    ("EMP009", "Vivek Rana", "vivek@attendai.com", "employee", "Sales & Support", "Account Executive"),
    ("EMP010", "Sara Khan", "sara@attendai.com", "employee", "Sales & Support", "Support Engineer"),
]


def main():
    db = SessionLocal()
    if db.scalar(select(Employee.id).limit(1)):
        print("Employees already exist - skipping seed.")
        return
    depts = {d.name: d.id for d in db.scalars(select(Department))}
    shift = db.scalar(select(Shift).where(Shift.is_default.is_(True)))
    quotas = db.scalars(select(LeaveType).where(LeaveType.annual_quota > 0)).all()
    manager_id = None
    for code, name, email, role, dept, title in PEOPLE:
        emp = Employee(employee_code=code, full_name=name, email=email, role=role, designation=title,
                       password_hash=hash_password(PASSWORD), department_id=depts[dept], shift_id=shift.id,
                       manager_id=manager_id if role == "employee" else None, date_of_joining=date(2024, 6, 3),
                       work_mode=random.choice(["office", "office", "hybrid", "wfh"]))
        db.add(emp)
        db.flush()
        if role == "manager":
            manager_id = emp.id
        for lt in quotas:
            db.add(LeaveBalance(employee_id=emp.id, leave_type_id=lt.id, year=date.today().year,
                                allocated=lt.annual_quota, used=0))
        for i in range(1, 31):
            d = date.today() - timedelta(days=i)
            if d.weekday() >= 5:
                continue
            r = random.random()
            if r < 0.06:
                db.add(Attendance(employee_id=emp.id, work_date=d, status="absent"))
                continue
            late = random.randint(20, 75) if r < 0.22 else 0
            cin = datetime.combine(d, time(9, 30), tzinfo=IST) + timedelta(minutes=late or random.randint(-25, 10))
            worked = random.randint(470, 560)
            db.add(Attendance(employee_id=emp.id, work_date=d, check_in=cin, check_out=cin + timedelta(minutes=worked),
                              check_in_method="web", check_out_method="web", work_mode=emp.work_mode,
                              status="late" if late else "present", late_minutes=late, worked_minutes=worked,
                              overtime_minutes=max(0, worked - 480)))
    db.commit()
    print(f"Seeded {len(PEOPLE)} employees. Login: admin@attendai.com / {PASSWORD}")


if __name__ == "__main__":
    main()
