"""Face ID. The browser (face-api) turns a face into 128 numbers; only those numbers are stored, never a photo.

What this does and does not prove: the match is decided here on the server, enrolment needs your password and consent,
and repeated misses lock face check-in for a while. The blink check that guards against a held-up photo runs in the
browser, so a determined person with their own login could skip it. Treat face check-in as a convenience, not as proof of identity."""
import math
import time
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import emailer, notify
from ..database import FACE_MATCH_THRESHOLD, get_db
from ..models import Employee, FaceTemplate
from ..schemas import FaceEnrollIn
from ..security import current_user, require_roles, verify_password

router = APIRouter(prefix="/api/face", tags=["Face ID"])
SAMPLE_SPREAD = 0.45  # enrolment samples further apart than this are probably not the same person
MAX_FAILS, FAIL_WINDOW = 5, 600  # five misses within ten minutes pause that feature for the person
_fails: dict[tuple[str, int], list[float]] = {}  # in memory: per server process, cleared on restart


def face_distance(a: list[float], b: list[float]) -> float:
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))


def check_vector(vec: list[float]) -> list[float]:
    if len(vec) != 128 or not all(math.isfinite(v) and abs(v) < 10 for v in vec):
        raise HTTPException(422, "Invalid face data")
    return vec


def matches(vec: list[float], template: list[float]) -> bool:
    return face_distance(vec, template) <= FACE_MATCH_THRESHOLD  # written so that a NaN can never count as a match


def check_lock(scope: str, user_id: int) -> None:
    now = time.time()
    recent = [t for t in _fails.get((scope, user_id), []) if now - t < FAIL_WINDOW]
    _fails[(scope, user_id)] = recent
    if len(recent) >= MAX_FAILS:
        wait = int((FAIL_WINDOW - (now - recent[0])) // 60) + 1
        raise HTTPException(429, f"Too many failed attempts. Try again in {wait} min, or check in another way.")


def record_fail(scope: str, user_id: int) -> None:
    _fails.setdefault((scope, user_id), []).append(time.time())


def clear_fails(scope: str, user_id: int) -> None:
    _fails.pop((scope, user_id), None)


@router.get("/status")
def status(db: Session = Depends(get_db), user: Employee = Depends(current_user)):
    updated = db.scalar(select(FaceTemplate.updated_at).where(FaceTemplate.employee_id == user.id))
    return {"enrolled": updated is not None, "enrolled_at": updated}


@router.get("/enrolled")
def enrolled(db: Session = Depends(get_db), user: Employee = Depends(require_roles("admin", "hr"))):
    """Who has Face ID set up. Never includes the face data itself."""
    rows = db.execute(select(Employee.id, Employee.employee_code, Employee.full_name, FaceTemplate.updated_at)
                      .join(FaceTemplate, FaceTemplate.employee_id == Employee.id).order_by(Employee.full_name)).all()
    return [{"employee_id": i, "employee_code": c, "full_name": n, "enrolled_at": t} for i, c, n, t in rows]


@router.post("/enroll")
def enroll(body: FaceEnrollIn, background: BackgroundTasks, db: Session = Depends(get_db), user: Employee = Depends(current_user)):
    if not body.consent:
        raise HTTPException(400, "Consent is required to store your face data")
    check_lock("password", user.id)
    if not verify_password(body.password, user.password_hash):
        record_fail("password", user.id)
        raise HTTPException(403, "That password is not correct")
    clear_fails("password", user.id)
    samples = [check_vector(s) for s in body.descriptors]
    for i in range(len(samples)):
        for j in range(i + 1, len(samples)):
            if face_distance(samples[i], samples[j]) > SAMPLE_SPREAD:
                raise HTTPException(400, "The photos don't look like the same person. Make sure only you are in front of the camera and try again.")
    mean = [sum(col) / len(samples) for col in zip(*samples)]
    now = datetime.now(timezone.utc)
    template = db.scalar(select(FaceTemplate).where(FaceTemplate.employee_id == user.id))
    if template:
        template.descriptor, template.updated_at, template.consented_at = mean, now, now
    else:
        db.add(FaceTemplate(employee_id=user.id, descriptor=mean, consented_at=now, updated_at=now))
    clear_fails("face", user.id)
    notify.add(db, user.id, "Face ID is set up", "You can now check in and out with your face. If this wasn't you, tell HR.", "/face")
    db.commit()
    background.add_task(emailer.send_email, user.email, *emailer.face_enrolled(user.full_name))
    return {"enrolled": True, "enrolled_at": now}


@router.delete("/me", status_code=204)
def remove_mine(db: Session = Depends(get_db), user: Employee = Depends(current_user)):
    template = db.scalar(select(FaceTemplate).where(FaceTemplate.employee_id == user.id))
    if template:
        db.delete(template)
        db.commit()


@router.delete("/{employee_id}", status_code=204)
def remove_for(employee_id: int, db: Session = Depends(get_db), user: Employee = Depends(require_roles("admin", "hr"))):
    """HR can clear someone's face data, for example when they leave the company."""
    template = db.scalar(select(FaceTemplate).where(FaceTemplate.employee_id == employee_id))
    if not template:
        raise HTTPException(404, "No face data for this employee")
    db.delete(template)
    notify.add(db, employee_id, "Face ID was removed", "HR removed your Face ID. You can set it up again from the Face ID page.", "/face")
    db.commit()
