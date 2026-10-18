"""ORM models mapped onto the tables created by database/schema.sql."""
from datetime import date, datetime, time, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy import BigInteger, Boolean, Date, DateTime, Float, ForeignKey, Integer, Numeric, String, Text, Time
from sqlalchemy.dialects.postgresql import ARRAY, ENUM
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def pg_enum(name, *values):
    return ENUM(*values, name=name, create_type=False)  # types already exist from schema.sql


ROLE = pg_enum("user_role", "admin", "hr", "manager", "employee")
EMP_STATUS = pg_enum("employee_status", "active", "on_notice", "inactive")
WORK_MODE = pg_enum("work_mode", "office", "wfh", "hybrid")
ATT_STATUS = pg_enum("attendance_status", "present", "late", "half_day", "absent", "on_leave", "holiday", "weekend")
CHECK_METHOD = pg_enum("check_method", "web", "geo", "qr", "manual", "face")
REQ_STATUS = pg_enum("request_status", "pending", "approved", "rejected", "cancelled")
TZ = DateTime(timezone=True)


def utcnow():
    return datetime.now(timezone.utc)


class Department(Base):
    __tablename__ = "departments"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80), unique=True)
    description: Mapped[Optional[str]] = mapped_column(Text)


class Shift(Base):
    __tablename__ = "shifts"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(50), unique=True)
    start_time: Mapped[time] = mapped_column(Time)
    end_time: Mapped[time] = mapped_column(Time)
    grace_minutes: Mapped[int] = mapped_column(Integer, default=15)
    half_day_minutes: Mapped[int] = mapped_column(Integer, default=240)
    full_day_minutes: Mapped[int] = mapped_column(Integer, default=480)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)


class OfficeLocation(Base):
    __tablename__ = "office_locations"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    latitude: Mapped[Decimal] = mapped_column(Numeric(9, 6))
    longitude: Mapped[Decimal] = mapped_column(Numeric(9, 6))
    radius_m: Mapped[int] = mapped_column(Integer, default=150)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Employee(Base):
    __tablename__ = "employees"
    id: Mapped[int] = mapped_column(primary_key=True)
    employee_code: Mapped[str] = mapped_column(String(20), unique=True)
    full_name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(160))
    phone: Mapped[Optional[str]] = mapped_column(String(20))
    password_hash: Mapped[str] = mapped_column(Text)
    role: Mapped[str] = mapped_column(ROLE, default="employee")
    department_id: Mapped[Optional[int]] = mapped_column(ForeignKey("departments.id"))
    manager_id: Mapped[Optional[int]] = mapped_column(ForeignKey("employees.id"))
    shift_id: Mapped[Optional[int]] = mapped_column(ForeignKey("shifts.id"))
    designation: Mapped[Optional[str]] = mapped_column(String(80))
    work_mode: Mapped[str] = mapped_column(WORK_MODE, default="office")
    status: Mapped[str] = mapped_column(EMP_STATUS, default="active")
    date_of_joining: Mapped[date] = mapped_column(Date)
    date_of_birth: Mapped[Optional[date]] = mapped_column(Date)
    department: Mapped[Optional[Department]] = relationship(lazy="joined")
    shift: Mapped[Optional[Shift]] = relationship(lazy="joined")
    face: Mapped[Optional["FaceTemplate"]] = relationship(lazy="joined", uselist=False)

    @property
    def face_enrolled(self) -> bool:
        return self.face is not None


class Attendance(Base):
    __tablename__ = "attendance"
    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"))
    work_date: Mapped[date] = mapped_column(Date)
    check_in: Mapped[Optional[datetime]] = mapped_column(TZ)
    check_out: Mapped[Optional[datetime]] = mapped_column(TZ)
    check_in_method: Mapped[Optional[str]] = mapped_column(CHECK_METHOD)
    check_out_method: Mapped[Optional[str]] = mapped_column(CHECK_METHOD)
    check_in_lat: Mapped[Optional[Decimal]] = mapped_column(Numeric(9, 6))
    check_in_lng: Mapped[Optional[Decimal]] = mapped_column(Numeric(9, 6))
    location_id: Mapped[Optional[int]] = mapped_column(ForeignKey("office_locations.id"))
    work_mode: Mapped[str] = mapped_column(WORK_MODE, default="office")
    status: Mapped[str] = mapped_column(ATT_STATUS, default="present")
    late_minutes: Mapped[int] = mapped_column(Integer, default=0)
    early_leave_minutes: Mapped[int] = mapped_column(Integer, default=0)
    worked_minutes: Mapped[int] = mapped_column(Integer, default=0)
    overtime_minutes: Mapped[int] = mapped_column(Integer, default=0)
    notes: Mapped[Optional[str]] = mapped_column(Text)


class LeaveType(Base):
    __tablename__ = "leave_types"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(50), unique=True)
    code: Mapped[str] = mapped_column(String(10), unique=True)
    annual_quota: Mapped[Decimal] = mapped_column(Numeric(5, 1), default=0)
    is_paid: Mapped[bool] = mapped_column(Boolean, default=True)


class LeaveBalance(Base):
    __tablename__ = "leave_balances"
    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"))
    leave_type_id: Mapped[int] = mapped_column(ForeignKey("leave_types.id"))
    year: Mapped[int] = mapped_column(Integer)
    allocated: Mapped[Decimal] = mapped_column(Numeric(5, 1), default=0)
    used: Mapped[Decimal] = mapped_column(Numeric(5, 1), default=0)


class LeaveRequest(Base):
    __tablename__ = "leave_requests"
    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"))
    leave_type_id: Mapped[int] = mapped_column(ForeignKey("leave_types.id"))
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    is_half_day: Mapped[bool] = mapped_column(Boolean, default=False)
    days: Mapped[Decimal] = mapped_column(Numeric(4, 1))
    reason: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[str] = mapped_column(REQ_STATUS, default="pending")
    reviewed_by: Mapped[Optional[int]] = mapped_column(ForeignKey("employees.id"))
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(TZ)
    review_note: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(TZ, default=utcnow)


class Holiday(Base):
    __tablename__ = "holidays"
    id: Mapped[int] = mapped_column(primary_key=True)
    holiday_date: Mapped[date] = mapped_column(Date, unique=True)
    name: Mapped[str] = mapped_column(String(100))
    is_optional: Mapped[bool] = mapped_column(Boolean, default=False)


class FaceTemplate(Base):
    """A 128-number face descriptor (not a photo). One per employee. Deferred so ordinary queries never load it."""
    __tablename__ = "face_templates"
    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id", ondelete="CASCADE"), unique=True)
    descriptor: Mapped[list[float]] = mapped_column(ARRAY(Float), deferred=True)
    consented_at: Mapped[datetime] = mapped_column(TZ, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(TZ, default=utcnow)


class Notification(Base):
    """What the bell in the app shows. Emails for the same events are sent by emailer.py."""
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(120))
    message: Mapped[str] = mapped_column(Text)
    link: Mapped[Optional[str]] = mapped_column(String(200))
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(TZ, default=utcnow)


class Regularization(Base):
    """A missed-punch correction request: the employee says what the times should have been, an approver decides."""
    __tablename__ = "regularizations"
    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id", ondelete="CASCADE"))
    work_date: Mapped[date] = mapped_column(Date)
    requested_check_in: Mapped[Optional[datetime]] = mapped_column(TZ)
    requested_check_out: Mapped[Optional[datetime]] = mapped_column(TZ)
    reason: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(REQ_STATUS, default="pending")
    reviewed_by: Mapped[Optional[int]] = mapped_column(ForeignKey("employees.id"))
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(TZ)
    created_at: Mapped[datetime] = mapped_column(TZ, default=utcnow)
