from datetime import date

from conftest import ist


def test_check_in_then_check_out(client, neha):
    r = client.post("/api/attendance/check-in", headers=neha, json={"method": "web"})
    assert r.status_code == 200 and r.json()["check_in"] and r.json()["check_out"] is None
    r = client.post("/api/attendance/check-out", headers=neha)
    assert r.status_code == 200 and r.json()["check_out"]
    assert client.get("/api/attendance/today", headers=neha).json()["check_out"]


def test_double_check_in_and_double_check_out_are_refused(client, neha):
    assert client.post("/api/attendance/check-in", headers=neha, json={"method": "web"}).status_code == 200
    assert client.post("/api/attendance/check-in", headers=neha, json={"method": "web"}).status_code == 400
    assert client.post("/api/attendance/check-out", headers=neha).status_code == 200
    assert client.post("/api/attendance/check-out", headers=neha).status_code == 400


def test_check_out_without_check_in(client, karan):
    assert client.post("/api/attendance/check-out", headers=karan).status_code == 400


def test_on_time_late_and_grace(client, neha, karan, freeze):
    freeze(ist(2026, 5, 6, 9, 40))  # shift 09:30, grace 15 min
    r = client.post("/api/attendance/check-in", headers=neha, json={"method": "web"}).json()
    assert r["status"] == "present" and r["late_minutes"] == 0
    freeze(ist(2026, 5, 6, 10, 15))
    r = client.post("/api/attendance/check-in", headers=karan, json={"method": "web"}).json()
    assert r["status"] == "late" and r["late_minutes"] == 45


def test_worked_overtime_and_early_leave(client, neha, freeze):
    freeze(ist(2026, 5, 6, 9, 30))
    client.post("/api/attendance/check-in", headers=neha, json={"method": "web"})
    freeze(ist(2026, 5, 6, 19, 30))  # 10 h later, shift ends 18:30 and a day is 8 h
    r = client.post("/api/attendance/check-out", headers=neha).json()
    assert r["worked_minutes"] == 600 and r["overtime_minutes"] == 120 and r["early_leave_minutes"] == 0


def test_early_leave_is_counted(client, neha, freeze):
    freeze(ist(2026, 5, 6, 9, 30))
    client.post("/api/attendance/check-in", headers=neha, json={"method": "web"})
    freeze(ist(2026, 5, 6, 17, 30))
    assert client.post("/api/attendance/check-out", headers=neha).json()["early_leave_minutes"] == 60


def test_geo_check_in_outside_the_office_radius_is_refused(client, neha):
    far = client.post("/api/attendance/check-in", headers=neha, json={"method": "geo", "latitude": 19.07, "longitude": 72.87, "work_mode": "office"})
    assert far.status_code == 403 and "from Head Office" in far.json()["detail"]
    near = client.post("/api/attendance/check-in", headers=neha, json={"method": "geo", "latitude": 23.0226, "longitude": 72.5714, "work_mode": "office"})
    assert near.status_code == 200


def test_history_and_team_views_respect_roles(client, neha, manager):
    assert client.get("/api/attendance/me?month=2026-05", headers=neha).status_code == 200
    assert client.get("/api/attendance/me?month=2026-13", headers=neha).status_code == 422
    assert client.get("/api/attendance/daily", headers=neha).status_code == 403


def test_night_shift_check_in_and_check_out_next_morning(client, hr, freeze):
    r = client.post("/api/shifts", headers=hr, json={"name": "Night", "start_time": "22:00", "end_time": "06:00"})
    assert r.status_code == 201, r.text
    shift_id = r.json()["id"]
    from conftest import employee_id
    uid = employee_id(client, hr, "dev@attendai.com")
    assert client.patch(f"/api/employees/{uid}", headers=hr, json={"shift_id": shift_id}).status_code == 200
    dev = {"Authorization": "Bearer " + client.post("/api/auth/login", json={"email": "dev@attendai.com", "password": "Demo@1234"}).json()["access_token"]}

    freeze(ist(2026, 5, 6, 22, 10))
    a = client.post("/api/attendance/check-in", headers=dev, json={"method": "web"}).json()
    assert a["work_date"] == "2026-05-06" and a["late_minutes"] == 0
    freeze(ist(2026, 5, 7, 1, 0))  # after midnight the shift is still "yesterday's", and today's view finds it
    assert client.get("/api/attendance/today", headers=dev).json()["work_date"] == "2026-05-06"
    assert client.post("/api/attendance/check-in", headers=dev, json={"method": "web"}).status_code == 400
    freeze(ist(2026, 5, 7, 6, 5))
    out = client.post("/api/attendance/check-out", headers=dev).json()
    assert out["work_date"] == "2026-05-06" and out["worked_minutes"] == 475 and out["early_leave_minutes"] == 0

    client.patch(f"/api/employees/{uid}", headers=hr, json={"shift_id": 1})  # leave the demo data as it was


def test_night_shift_check_in_after_midnight_belongs_to_the_previous_day(client, hr, freeze):
    from conftest import employee_id
    night = next(s for s in client.get("/api/shifts", headers=hr).json() if s["name"] == "Night")
    uid = employee_id(client, hr, "meera@attendai.com")
    client.patch(f"/api/employees/{uid}", headers=hr, json={"shift_id": night["id"]})
    meera = {"Authorization": "Bearer " + client.post("/api/auth/login", json={"email": "meera@attendai.com", "password": "Demo@1234"}).json()["access_token"]}
    freeze(ist(2026, 5, 7, 0, 30))
    a = client.post("/api/attendance/check-in", headers=meera, json={"method": "web"}).json()
    assert a["work_date"] == "2026-05-06" and a["late_minutes"] == 150
    client.patch(f"/api/employees/{uid}", headers=hr, json={"shift_id": 1})
