from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import throttle
from ..database import get_db
from ..models import Employee
from ..schemas import ChangePasswordIn, EmployeeOut, LoginIn, TokenOut
from ..security import create_token, current_user, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["Auth"])
LOGIN_LIMIT, LOGIN_WINDOW = 8, 900  # 8 wrong passwords in 15 minutes pauses that email + address


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, request: Request, db: Session = Depends(get_db)):
    key = f"login:{body.email.lower()}|{throttle.client_ip(request)}"
    throttle.check(key, LOGIN_LIMIT, LOGIN_WINDOW, "sign-in attempts")
    emp = db.scalar(select(Employee).where(func.lower(Employee.email) == body.email.lower()))
    if not emp or emp.status == "inactive" or not verify_password(body.password, emp.password_hash):
        throttle.fail(key)
        raise HTTPException(401, "Incorrect email or password")
    throttle.clear(key)
    return TokenOut(access_token=create_token(emp), user=EmployeeOut.model_validate(emp))


@router.get("/me", response_model=EmployeeOut)
def me(user: Employee = Depends(current_user)):
    return user


@router.post("/change-password", status_code=204)
def change_password(body: ChangePasswordIn, db: Session = Depends(get_db), user: Employee = Depends(current_user)):
    key = f"pwchange:{user.id}"
    throttle.check(key, 5, 600, "password attempts")
    if not verify_password(body.current_password, user.password_hash):
        throttle.fail(key)
        raise HTTPException(400, "Your current password is not correct")
    if body.new_password == body.current_password:
        raise HTTPException(400, "Choose a password that is different from the current one")
    user.password_hash = hash_password(body.new_password)
    db.commit()
    throttle.clear(key)
