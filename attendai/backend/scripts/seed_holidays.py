"""Add fixed-date public holidays for 2026 and 2027.   Run from /backend:  python -m scripts.seed_holidays
Festivals that move every year (Diwali, Holi, Eid...) are not included. Add those from the app: Leave, then Holidays."""
from datetime import date

from sqlalchemy import select

from app.database import SessionLocal
from app.models import Holiday

FIXED = [(1, 14, "Uttarayan"), (1, 26, "Republic Day"), (5, 1, "Gujarat Foundation Day"),
         (8, 15, "Independence Day"), (10, 2, "Gandhi Jayanti"), (12, 25, "Christmas")]


def main():
    db = SessionLocal()
    added = 0
    for year in (2026, 2027):
        for month, day, name in FIXED:
            d = date(year, month, day)
            if not db.scalar(select(Holiday.id).where(Holiday.holiday_date == d)):
                db.add(Holiday(holiday_date=d, name=name))
                added += 1
    db.commit()
    print(f"Added {added} holidays.")


if __name__ == "__main__":
    main()
