"""In-app notifications. The caller commits, so a notification is only saved if the action it describes was."""
from typing import Optional

from sqlalchemy.orm import Session

from .models import Notification


def add(db: Session, employee_id: int, title: str, message: str, link: Optional[str] = None) -> None:
    db.add(Notification(employee_id=employee_id, title=title[:120], message=message, link=link))
