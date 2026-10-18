"""Pydantic request/response models."""
from datetime import date, datetime, time
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field

Role = Literal["admin", "hr", "manager", "employee"]
Mode = Literal["office", "wfh", "hybrid"]
EmpStatus = Literal["active", "on_notice", "inactive"]


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class DeptOut(ORM):
    id: int
    name: str
    description: Optional[str] = None


class ShiftOut(ORM):
    id: int
    name: str
    start_time: time
    end_time: time
    grace_minutes: int
    half_day_minutes: int = 240
    full_day_minutes: int = 480
    is_default: bool = False


class EmployeeOut(ORM):
    id: int
    employee_code: str
    full_name: str
    email: str
    phone: Optional[str] = None
    role: str
    designation: Optional[str] = None
    work_mode: str
    status: str
    date_of_joining: date
    manager_id: Optional[int] = None
    department: Optional[DeptOut] = None
    shift: Optional[ShiftOut] = None
    face_enrolled: bool = False


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: EmployeeOut


class EmployeeCreate(BaseModel):
    employee_code: str = Field(max_length=20)
    full_name: str = Field(max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    phone: Optional[str] = None
    role: Role = "employee"
    department_id: Optional[int] = None
    manager_id: Optional[int] = None
    shift_id: Optional[int] = None
    designation: Optional[str] = None
    work_mode: Mode = "office"
    date_of_joining: date


class EmployeeUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[Role] = None
    department_id: Optional[int] = None
    manager_id: Optional[int] = None
    shift_id: Optional[int] = None
    designation: Optional[str] = None
    work_mode: Optional[Mode] = None
    status: Optional[EmpStatus] = None


class CheckInIn(BaseModel):
    method: Literal["web", "geo"] = "web"
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    work_mode: Optional[Mode] = None


class AttendanceOut(ORM):
    id: int
    employee_id: int
    work_date: date
    check_in: Optional[datetime] = None
    check_out: Optional[datetime] = None
    check_in_method: Optional[str] = None
    check_out_method: Optional[str] = None
    status: str
    work_mode: str
    late_minutes: int
    early_leave_minutes: int
    worked_minutes: int
    overtime_minutes: int


class LeaveApply(BaseModel):
    leave_type_id: int
    start_date: date
    end_date: date
    is_half_day: bool = False
    reason: Optional[str] = Field(None, max_length=500)


class ReviewIn(BaseModel):
    approve: bool
    note: Optional[str] = Field(None, max_length=500)


class LeaveOut(ORM):
    id: int
    employee_id: int
    leave_type_id: int
    start_date: date
    end_date: date
    is_half_day: bool
    days: float
    reason: Optional[str] = None
    status: str
    review_note: Optional[str] = None
    created_at: datetime


class HolidayIn(BaseModel):
    holiday_date: date
    name: str = Field(min_length=2, max_length=100)
    is_optional: bool = False


class HolidayOut(ORM):
    id: int
    holiday_date: date
    name: str
    is_optional: bool


class QrPunchIn(BaseModel):
    token: str = Field(min_length=8, max_length=200)


class FacePunchIn(BaseModel):
    descriptor: list[float] = Field(min_length=128, max_length=128)
    work_mode: Optional[Mode] = None


class FaceEnrollIn(BaseModel):
    descriptors: list[list[float]] = Field(min_length=2, max_length=6)
    consent: bool
    password: str = Field(min_length=1, max_length=72)  # re-entered so a borrowed session cannot enrol someone else's face


class PunchOut(BaseModel):
    """QR and face scans check in on the first scan of the day and check out on the next."""
    action: Literal["check_in", "check_out"]
    attendance: AttendanceOut


class NotificationOut(ORM):
    id: int
    title: str
    message: str
    link: Optional[str] = None
    is_read: bool
    created_at: datetime


class ShiftIn(BaseModel):
    name: str = Field(min_length=2, max_length=50)
    start_time: time
    end_time: time
    grace_minutes: int = Field(15, ge=0, le=120)
    half_day_minutes: int = Field(240, ge=30, le=720)
    full_day_minutes: int = Field(480, ge=60, le=960)


class ShiftUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=50)
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    grace_minutes: Optional[int] = Field(None, ge=0, le=120)
    half_day_minutes: Optional[int] = Field(None, ge=30, le=720)
    full_day_minutes: Optional[int] = Field(None, ge=60, le=960)
    is_default: Optional[bool] = None


class DeptIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    description: Optional[str] = Field(None, max_length=300)


class ChangePasswordIn(BaseModel):
    current_password: str = Field(min_length=1, max_length=72)
    new_password: str = Field(min_length=8, max_length=72)


class ResetPasswordIn(BaseModel):
    new_password: str = Field(min_length=8, max_length=72)


class CorrectionIn(BaseModel):
    work_date: date
    check_in: Optional[time] = None
    check_out: Optional[time] = None
    reason: str = Field(min_length=5, max_length=500)


class CorrectionOut(ORM):
    id: int
    employee_id: int
    work_date: date
    requested_check_in: Optional[datetime] = None
    requested_check_out: Optional[datetime] = None
    reason: str
    status: str
    created_at: datetime


class ImportIn(BaseModel):
    csv: str = Field(min_length=10, max_length=400_000)
    dry_run: bool = False
