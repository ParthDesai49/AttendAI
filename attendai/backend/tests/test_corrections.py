from datetime import timedelta

from conftest import last_weekday


def ask(client, headers, day, check_in=None, check_out=None, reason="Forgot to check out"):
    body = {"work_date": str(day), "reason": reason}
    if check_in: body["check_in"] = check_in
    if check_out: body["check_out"] = check_out
    return client.post("/api/corrections", headers=headers, json=body)


def test_validation(client, neha):
    day = last_weekday(3)
    assert ask(client, neha, day).status_code == 400  # no times at all
    assert ask(client, neha, day, check_out="18:30").status_code == 400  # check-out but no check-in on record
    assert ask(client, neha, day, "18:00", "09:00").status_code == 400  # out before in on a day shift
    assert ask(client, neha, day + timedelta(days=60), "09:30").status_code == 400  # future
    assert ask(client, neha, day - timedelta(days=60), "09:30").status_code == 400  # too old
    assert client.post("/api/corrections", headers=neha, json={"work_date": str(day), "check_in": "09:30", "reason": "x"}).status_code == 422


def test_full_flow_rewrites_the_day_and_scores_it(client, neha, manager, outbox):
    day = last_weekday(2)
    r = ask(client, neha, day, "09:50", "19:20")
    assert r.status_code == 201, r.text
    cid = r.json()["id"]
    assert ask(client, neha, day, "09:40").status_code == 409  # one pending per day
    assert any(m["to"] == "manager@attendai.com" for m in outbox)
    pend = client.get("/api/corrections/pending", headers=manager).json()
    assert cid in [p["id"] for p in pend] and pend[0]["employee_name"] == "Neha Joshi"
    assert client.post(f"/api/corrections/{cid}/review", headers=neha, json={"approve": True}).status_code == 403
    assert client.post(f"/api/corrections/{cid}/review", headers=manager, json={"approve": True}).status_code == 200
    row = next(a for a in client.get(f"/api/attendance/me?month={day:%Y-%m}", headers=neha).json() if a["work_date"] == str(day))
    assert row["check_in_method"] == "manual" and row["worked_minutes"] == 570 and row["late_minutes"] == 20 and row["status"] == "late"
    assert row["overtime_minutes"] == 90
    assert any("correction was approved" in n["title"] for n in client.get("/api/notifications", headers=neha).json()["items"])
    assert any(m["to"] == "neha@attendai.com" and "approved" in m["subject"] for m in outbox)


def test_reject_changes_nothing(client, neha, manager):
    day = last_weekday(3)
    cid = ask(client, neha, day, "09:00", "18:00").json()["id"]
    assert client.post(f"/api/corrections/{cid}/review", headers=manager, json={"approve": False, "note": "No record"}).status_code == 200
    rows = client.get(f"/api/attendance/me?month={day:%Y-%m}", headers=neha).json()
    assert not any(a["work_date"] == str(day) and a["check_in_method"] == "manual" for a in rows)
    assert client.post(f"/api/corrections/{cid}/review", headers=manager, json={"approve": True}).status_code == 400  # already decided


def test_missed_check_out_can_be_fixed(client, karan, manager, freeze):
    from conftest import ist
    day = last_weekday(1)
    freeze(ist(day.year, day.month, day.day, 9, 30))
    client.post("/api/attendance/check-in", headers=karan, json={"method": "web"})  # forgot to check out
    freeze(ist(day.year, day.month, day.day, 21, 0))
    cid = ask(client, karan, day, check_out="18:45").json()["id"]
    client.post(f"/api/corrections/{cid}/review", headers=manager, json={"approve": True})
    row = next(a for a in client.get(f"/api/attendance/me?month={day:%Y-%m}", headers=karan).json() if a["work_date"] == str(day))
    assert row["worked_minutes"] == 555 and row["check_out_method"] == "manual"


def test_managers_only_review_their_own_reports_and_own_requests_are_blocked(client, hr, manager):
    day = last_weekday(4)
    cid = ask(client, hr, day, "09:30", "18:30").json()["id"]  # Priya reports to nobody
    assert cid not in [p["id"] for p in client.get("/api/corrections/pending", headers=manager).json()]
    assert client.post(f"/api/corrections/{cid}/review", headers=manager, json={"approve": True}).status_code == 403
    assert client.post(f"/api/corrections/{cid}/review", headers=hr, json={"approve": True}).status_code == 403  # not your own


def test_cancel(client, neha, karan):
    day = last_weekday(5)
    cid = ask(client, neha, day, "09:30").json()["id"]
    assert client.post(f"/api/corrections/{cid}/cancel", headers=karan).status_code == 404
    assert client.post(f"/api/corrections/{cid}/cancel", headers=neha).status_code == 200
    assert ask(client, neha, day, "09:30").status_code == 201  # a new one is allowed after cancelling


def test_night_shift_check_out_may_be_the_next_morning(client, hr, auth):
    shift = next(s for s in client.get("/api/shifts", headers=hr).json() if s["name"] == "Night")
    from conftest import employee_id
    uid = employee_id(client, hr, "isha@attendai.com")
    client.patch(f"/api/employees/{uid}", headers=hr, json={"shift_id": shift["id"]})
    isha = auth("isha@attendai.com")
    r = ask(client, isha, last_weekday(2), "22:00", "06:00")
    assert r.status_code == 201 and r.json()["requested_check_out"] > r.json()["requested_check_in"]
    client.post(f"/api/corrections/{r.json()['id']}/cancel", headers=isha)
    client.patch(f"/api/employees/{uid}", headers=hr, json={"shift_id": 1})
