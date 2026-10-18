"""Email notifications.
Mode is chosen from the environment:
  SMTP_HOST set        -> real emails through that SMTP server
  SMTP_HOST not set    -> "console": the email is printed in the backend terminal (handy for demos)
  EMAIL_ENABLED=false  -> nothing is sent
Sending never breaks a request: routers hand emails to FastAPI background tasks and failures are only logged."""
import logging
import os
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr
from html import escape
from typing import Optional

from .database import APP_URL  # importing this also loads .env

log = logging.getLogger("attendai.email")


def current_mode() -> str:
    if os.getenv("EMAIL_ENABLED", "true").lower() == "false":
        return "off"
    return "smtp" if os.getenv("SMTP_HOST") else "console"


def from_address() -> str:
    return os.getenv("SMTP_FROM") or os.getenv("SMTP_USER") or "attendai@localhost"


def deliver(to: str, subject: str, text: str, html: Optional[str] = None) -> None:
    """Sends one email and raises on failure (the test endpoint uses this to show the real error)."""
    mode = current_mode()
    if mode == "off":
        return
    if mode == "console":
        print(f"\n--- AttendAI email (console mode) ---\nTo: {to}\nSubject: {subject}\n\n{text}\n--- end ---\n", flush=True)
        return
    msg = EmailMessage()
    msg["Subject"], msg["To"] = subject, to
    msg["From"] = formataddr(("AttendAI", from_address()))
    msg.set_content(text)
    if html:
        msg.add_alternative(html, subtype="html")
    host, port = os.environ["SMTP_HOST"], int(os.getenv("SMTP_PORT", "587"))
    security = os.getenv("SMTP_SECURITY", "starttls").lower()
    ctx = ssl.create_default_context()
    smtp = smtplib.SMTP_SSL(host, port, timeout=15, context=ctx) if security == "ssl" else smtplib.SMTP(host, port, timeout=15)
    with smtp:
        if security == "starttls":
            smtp.starttls(context=ctx)
        if os.getenv("SMTP_USER"):
            smtp.login(os.environ["SMTP_USER"], os.getenv("SMTP_PASSWORD", ""))
        smtp.send_message(msg)


def send_email(to: str, subject: str, text: str, html: Optional[str] = None) -> None:
    try:
        deliver(to, subject, text, html)
    except Exception:
        log.exception("Could not send email to %s", to)


def _layout(heading: str, lines: list[str], button: Optional[tuple[str, str]] = None) -> tuple[str, str]:
    text = "\n\n".join([heading, *lines] + ([f"{button[0]}: {button[1]}"] if button else []) + ["Sent by AttendAI"])
    body = "".join(f'<p style="margin:0 0 14px;font-size:15px;line-height:1.5;color:#0f1b2d">{escape(l)}</p>' for l in lines)
    cta = (f'<p style="margin:22px 0 0"><a href="{escape(button[1])}" style="background:#ffd23f;color:#14213d;text-decoration:none;'
           f'font-weight:600;padding:11px 20px;border-radius:8px;display:inline-block">{escape(button[0])}</a></p>') if button else ""
    html = (f'<div style="background:#eef1f6;padding:24px;font-family:Segoe UI,Arial,sans-serif"><div style="max-width:520px;margin:auto;'
            f'background:#fff;border-radius:14px;overflow:hidden"><div style="background:#14213d;color:#fff;padding:16px 24px;font-size:18px;'
            f'font-weight:700">AttendAI</div><div style="padding:24px"><h2 style="margin:0 0 16px;font-size:20px;color:#0f1b2d">{escape(heading)}</h2>'
            f'{body}{cta}</div><div style="padding:14px 24px;font-size:12px;color:#566377;border-top:1px solid #d6dce6">Sent by AttendAI</div></div></div>')
    return text, html


def _fmt(d) -> str:
    return d.strftime("%a %d %b %Y")


def _span(start, end, half: bool) -> str:
    if start == end:
        return _fmt(start) + (" (half day)" if half else "")
    return f"{_fmt(start)} to {_fmt(end)}"


span = _span


def _days(n) -> str:
    n = float(n)
    n = int(n) if n == int(n) else n
    return f"{n} {'day' if n == 1 else 'days'}"


def leave_requested(approver: str, employee: str, leave_type: str, start, end, half: bool, days, reason: Optional[str]):
    text, html = _layout(f"{employee} is asking for time off", [
        f"Hi {approver},", f"{employee} requested {_days(days)} of {leave_type}: {_span(start, end, half)}.",
        *([f"Reason: {reason}"] if reason else []),
    ], ("Review the request", f"{APP_URL}/leave?tab=approvals"))
    return f"{employee} requested {_days(days)} of {leave_type}", text, html


def leave_decided(employee: str, leave_type: str, start, end, half: bool, days, approved: bool, reviewer: str, note: Optional[str]):
    word = "approved" if approved else "rejected"
    text, html = _layout(f"Your leave request was {word}", [
        f"Hi {employee},", f"{reviewer} {word} your {leave_type} request for {_days(days)}: {_span(start, end, half)}.",
        *([f"Note from {reviewer}: {note}"] if note else []),
    ], ("Open AttendAI", f"{APP_URL}/leave"))
    return f"Your {leave_type} request was {word}", text, html


def welcome(name: str, email: str):
    text, html = _layout(f"Welcome to AttendAI, {name}", [
        "Your account has been created.", f"Sign in with this email address: {email}",
        "Your HR team will share your first password with you separately.",
    ], ("Open AttendAI", APP_URL))
    return "Welcome to AttendAI", text, html


def test_message(name: str):
    text, html = _layout("Email notifications are working", [
        f"Hi {name},", "This is a test message from AttendAI. If you can read it, leave requests and decisions will reach people by email.",
    ], ("Open AttendAI", APP_URL))
    return "AttendAI test email", text, html


def face_enrolled(name: str):
    text, html = _layout("Face ID was set up on your account", [
        f"Hi {name},", "You can now check in and out with your face. Only a set of numbers describing your face is stored, never a photo.",
        "If this wasn't you, tell HR straight away.",
    ], ("Open AttendAI", f"{APP_URL}/face"))
    return "Face ID was set up on your AttendAI account", text, html


def correction_requested(approver: str, employee: str, work_date, reason: str):
    text, html = _layout(f"{employee} asked for an attendance correction", [
        f"Hi {approver},", f"{employee} says their times for {_fmt(work_date)} are wrong.", f"Reason: {reason}",
    ], ("Review the request", f"{APP_URL}/corrections?tab=approvals"))
    return f"{employee} asked to correct {_fmt(work_date)}", text, html


def correction_decided(employee: str, work_date, approved: bool, reviewer: str):
    word = "approved" if approved else "rejected"
    text, html = _layout(f"Your correction was {word}", [
        f"Hi {employee},", f"{reviewer} {word} your attendance correction for {_fmt(work_date)}.",
    ], ("Open AttendAI", f"{APP_URL}/corrections"))
    return f"Your attendance correction was {word}", text, html


def password_reset(name: str, by: str):
    text, html = _layout("Your password was reset", [
        f"Hi {name},", f"{by} set a new password on your AttendAI account. They will share it with you directly.",
        "After you sign in, change it under Profile. If you didn't expect this, tell HR.",
    ], ("Open AttendAI", APP_URL))
    return "Your AttendAI password was reset", text, html
