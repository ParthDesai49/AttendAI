"""Attendance analytics. Rule-based insights computed with pandas, no external AI service involved."""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pandas as pd
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Attendance, Department, Employee
from ..security import require_roles

router = APIRouter(prefix="/api/analytics", tags=["Analytics"])
IST = ZoneInfo("Asia/Kolkata")
DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"]
FULL = dict(zip(DAYS, ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]))


def hm(minutes: float) -> str:
    h, m = divmod(int(round(minutes)), 60)
    return f"{h}h {m}m" if h else f"{m}m"


def load_frame(db: Session, user: Employee, since) -> pd.DataFrame:
    stmt = (select(Attendance.employee_id, Employee.full_name, Department.name, Attendance.work_date,
                   Attendance.check_in, Attendance.status, Attendance.worked_minutes, Attendance.overtime_minutes,
                   Attendance.work_mode)
            .join(Employee, Employee.id == Attendance.employee_id)
            .join(Department, Department.id == Employee.department_id, isouter=True)
            .where(Attendance.work_date >= since, Attendance.check_in.is_not(None)))
    if user.role == "manager":
        stmt = stmt.where(Employee.manager_id == user.id)
    cols = ["employee_id", "name", "team", "work_date", "check_in", "status", "worked", "overtime", "mode"]
    df = pd.DataFrame([tuple(r) for r in db.execute(stmt).all()], columns=cols)
    if df.empty:
        return df
    df["team"] = df["team"].fillna("No team")
    df["work_date"] = pd.to_datetime(df["work_date"])
    df["weekday"] = df["work_date"].dt.weekday
    local = pd.to_datetime(df["check_in"], utc=True).dt.tz_convert("Asia/Kolkata")
    df["arrival"] = local.dt.hour * 60 + local.dt.minute
    df["late"] = df["status"] == "late"
    return df


@router.get("/insights")
def insights(days: int = Query(60, ge=14, le=180), db: Session = Depends(get_db),
             user: Employee = Depends(require_roles("admin", "hr", "manager"))):
    today = datetime.now(IST).date()
    df = load_frame(db, user, today - timedelta(days=days))
    result = {"period_days": days, "check_ins": 0, "on_time_pct": None, "avg_hours": None, "overtime_hours": 0.0,
              "highlights": ["There is not enough attendance data yet to find patterns."],
              "by_weekday": [], "by_team": [], "weekly": [], "attention": []}
    if df.empty:
        return result

    worked = df[df["worked"] > 0]
    on_time = 100 * (1 - df["late"].mean())

    by_weekday = []
    for i, name in enumerate(DAYS):
        part = df[df["weekday"] == i]
        by_weekday.append({"day": name, "arrivals": int(len(part)),
                           "late_rate": round(float(100 * part["late"].mean()), 1) if len(part) else 0.0})

    by_team = [{"team": team, "arrivals": int(len(part)), "on_time_pct": round(float(100 * (1 - part["late"].mean())), 1)}
               for team, part in df.groupby("team")]
    by_team.sort(key=lambda t: -t["on_time_pct"])

    df["week"] = df["work_date"] - pd.to_timedelta(df["weekday"], unit="D")
    weekly = []
    for week, part in df.groupby("week"):
        w = part.loc[part["worked"] > 0, "worked"]
        weekly.append({"week": week.strftime("%Y-%m-%d"), "on_time_pct": round(float(100 * (1 - part["late"].mean())), 1),
                       "avg_hours": round(float(w.mean() / 60), 1) if len(w) else 0.0})

    attention = []
    recent = df[df["work_date"] > pd.Timestamp(today - timedelta(days=14))]
    for (eid, name, team), part in recent.groupby(["employee_id", "name", "team"]):
        late_n = int(part["late"].sum())
        w = part.loc[part["worked"] > 0, "worked"]
        reasons = []
        if late_n >= 3:
            reasons.append(f"Late {late_n} times in the last two weeks")
        if len(w) >= 5 and w.mean() >= 570:
            reasons.append(f"Averaging {hm(float(w.mean()))} a day, which is a long day to keep up")
        if reasons:
            attention.append({"employee_id": int(eid), "name": name, "team": team, "late_days": late_n, "reasons": reasons})
    attention.sort(key=lambda a: -a["late_days"])

    notes = [f"{on_time:.0f}% of check-ins were on time over the last {days} days."]
    ranked = [d for d in by_weekday if d["arrivals"] >= 10]
    if len(ranked) >= 3:
        worst = max(ranked, key=lambda d: d["late_rate"])
        others = [d["late_rate"] for d in ranked if d is not worst]
        avg_others = sum(others) / len(others)
        if worst["late_rate"] >= max(10, avg_others * 1.3):
            notes.append(f"{FULL[worst['day']]} is the hardest morning: {worst['late_rate']:.0f}% of arrivals are late, "
                         f"against {avg_others:.0f}% on other days.")
    if len(by_team) >= 2 and by_team[0]["on_time_pct"] - by_team[-1]["on_time_pct"] >= 5:
        notes.append(f"{by_team[0]['team']} is the most punctual team at {by_team[0]['on_time_pct']:.0f}% on time, "
                     f"and {by_team[-1]['team']} the least at {by_team[-1]['on_time_pct']:.0f}%.")
    overtime = int(df["overtime"].sum())
    if overtime > 0:
        per_person = df.groupby("name")["overtime"].sum()
        notes.append(f"People logged {hm(overtime)} of overtime in total, and {per_person.idxmax()} accounts for "
                     f"{hm(int(per_person.max()))} of it.")
    modes = worked.groupby("mode")["worked"].agg(["mean", "count"])
    if {"wfh", "office"} <= set(modes.index) and modes.loc["wfh", "count"] >= 10 and modes.loc["office", "count"] >= 10:
        diff = float(modes.loc["wfh", "mean"] - modes.loc["office", "mean"])
        if abs(diff) >= 15:
            notes.append(f"Remote days average {hm(float(modes.loc['wfh', 'mean']))}, which is {hm(abs(diff))} "
                         f"{'longer' if diff > 0 else 'shorter'} than days in the office.")
    last_two = df[df["work_date"] > pd.Timestamp(today - timedelta(days=14))]
    before = df[(df["work_date"] > pd.Timestamp(today - timedelta(days=28))) & (df["work_date"] <= pd.Timestamp(today - timedelta(days=14)))]
    if len(last_two) >= 10 and len(before) >= 10:
        change = 100 * (before["late"].mean() - last_two["late"].mean())
        if abs(change) >= 3:
            notes.append(f"Punctuality {'improved' if change > 0 else 'slipped'} by {abs(change):.0f} points "
                         "compared with the previous two weeks.")

    result.update(check_ins=int(len(df)), on_time_pct=round(float(on_time), 1),
                  avg_hours=round(float(worked["worked"].mean() / 60), 1) if len(worked) else None,
                  overtime_hours=round(overtime / 60, 1), highlights=notes[:5], by_weekday=by_weekday,
                  by_team=by_team, weekly=weekly, attention=attention)
    return result
