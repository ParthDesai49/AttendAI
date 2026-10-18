from app import emailer


def test_bell_counts_and_marks_read(client, neha, hr, outbox):
    from conftest import employee_id
    uid = employee_id(client, hr, "neha@attendai.com")
    client.post(f"/api/employees/{uid}/reset-password", headers=hr, json={"new_password": "Demo@1234"})
    data = client.get("/api/notifications", headers=neha).json()
    assert data["unread"] >= 1 and data["items"][0]["is_read"] is False
    assert client.post(f"/api/notifications/{data['items'][0]['id']}/read", headers=neha).status_code == 204
    assert client.get("/api/notifications", headers=neha).json()["unread"] == data["unread"] - 1
    assert client.post("/api/notifications/read-all", headers=neha).status_code == 204
    assert client.get("/api/notifications", headers=neha).json()["unread"] == 0


def test_nobody_reads_someone_elses_notification(client, neha, karan, hr):
    from conftest import employee_id
    uid = employee_id(client, hr, "neha@attendai.com")
    client.post(f"/api/employees/{uid}/reset-password", headers=hr, json={"new_password": "Demo@1234"})
    nid = client.get("/api/notifications", headers=neha).json()["items"][0]["id"]
    assert client.post(f"/api/notifications/{nid}/read", headers=karan).status_code == 404


def test_email_status_and_test_message(client, hr, neha, outbox):
    assert client.get("/api/notifications/email-status", headers=neha).status_code == 403
    st = client.get("/api/notifications/email-status", headers=hr).json()
    assert st["mode"] in ("console", "smtp", "off")
    r = client.post("/api/notifications/test-email", headers=hr)
    assert r.status_code in (200, 204) and outbox and outbox[-1]["to"] == "hr@attendai.com"


def test_failing_mail_server_never_breaks_a_request(client, neha, monkeypatch):
    def boom(*a, **k): raise ConnectionRefusedError("mail server is down")
    monkeypatch.setattr(emailer, "deliver", boom)
    from datetime import date, timedelta
    d = date.today() + timedelta(weeks=10)
    d -= timedelta(days=d.weekday())
    r = client.post("/api/leave", headers=neha, json={"leave_type_id": 1, "start_date": str(d), "end_date": str(d)})
    assert r.status_code == 201  # the request succeeds even though every email fails
    client.post(f"/api/leave/{r.json()['id']}/cancel", headers=neha)


def test_email_html_is_escaped():
    _, _, html = emailer.leave_requested("Boss", "<script>alert(1)</script>", "Casual", __import__("datetime").date(2026, 5, 6), __import__("datetime").date(2026, 5, 6), False, 1, "<b>x</b>")
    assert "<script>" not in html and "&lt;script&gt;" in html


def test_mail_modes(monkeypatch):
    monkeypatch.delenv("SMTP_HOST", raising=False)
    monkeypatch.delenv("EMAIL_ENABLED", raising=False)
    assert emailer.current_mode() == "console"
    monkeypatch.setenv("SMTP_HOST", "smtp.example.com")
    assert emailer.current_mode() == "smtp"
    monkeypatch.setenv("EMAIL_ENABLED", "false")
    assert emailer.current_mode() == "off"
