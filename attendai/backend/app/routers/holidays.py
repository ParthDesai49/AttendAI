from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Employee, Holiday
from ..schemas import HolidayIn, HolidayOut
from ..security import current_user, require_roles

router = APIRouter(prefix="/api/holidays", tags=["Holidays"])
HR = require_roles("admin", "hr")


@router.get("", response_model=list[HolidayOut])
def list_holidays(year: Optional[int] = Query(None, ge=2000, le=2100),
                  db: Session = Depends(get_db), user: Employee = Depends(current_user)):
    year = year or date.today().year
    return db.scalars(select(Holiday).where(Holiday.holiday_date.between(date(year, 1, 1), date(year, 12, 31)))
                      .order_by(Holiday.holiday_date)).all()


@router.post("", response_model=HolidayOut, status_code=201)
def add_holiday(body: HolidayIn, db: Session = Depends(get_db), user: Employee = Depends(HR)):
    if db.scalar(select(Holiday.id).where(Holiday.holiday_date == body.holiday_date)):
        raise HTTPException(409, "A holiday is already set for that date")
    holiday = Holiday(**body.model_dump())
    db.add(holiday)
    db.commit()
    db.refresh(holiday)
    return holiday


@router.delete("/{holiday_id}", status_code=204)
def remove_holiday(holiday_id: int, db: Session = Depends(get_db), user: Employee = Depends(HR)):
    holiday = db.get(Holiday, holiday_id)
    if not holiday:
        raise HTTPException(404, "Holiday not found")
    db.delete(holiday)
    db.commit()
