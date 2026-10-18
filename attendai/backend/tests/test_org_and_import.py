import pytest


def test_shift_rules(client, hr, neha):
    assert client.post("/api/shifts", headers=neha, json={"name": "X1", "start_time": "09:00", "end_time": "17:00"}).status_code == 403
    assert client.post("/api/shifts", headers=hr, json={"name": "Same", "start_time": "09:00", "end_time": "09:00"}).status_code == 400
    assert client.post("/api/shifts", headers=hr, json={"name": "Odd", "start_time": "09:00", "end_time": "17:00", "half_day_minutes": 500, "full_day_minutes": 480}).status_code == 400
    ok = client.post("/api/shifts", headers=hr, json={"name": "Support", "start_time": "11:00", "end_time": "20:00"})
    assert ok.status_code == 201
    assert client.post("/api/shifts", headers=hr, json={"name": "support", "start_time": "11:00", "end_time": "20:00"}).status_code == 409
    sid = ok.json()["id"]
    assert client.patch(f"/api/shifts/{sid}", headers=hr, json={"grace_minutes": 5}).json()["grace_minutes"] == 5
    assert client.delete(f"/api/shifts/{sid}", headers=hr).status_code == 204


def test_default_shift_cannot_be_deleted_and_one_default_only(client, hr):
    shifts = client.get("/api/shifts", headers=hr).json()
    default = next(s for s in shifts if s["is_default"])
    assert client.delete(f"/api/shifts/{default['id']}", headers=hr).status_code == 400
    other = next(s for s in shifts if not s["is_default"])
    client.patch(f"/api/shifts/{other['id']}", headers=hr, json={"is_default": True})
    assert sum(s["is_default"] for s in client.get("/api/shifts", headers=hr).json()) == 1
    client.patch(f"/api/shifts/{default['id']}", headers=hr, json={"is_default": True})  # restore


def test_shift_in_use_cannot_be_deleted(client, hr):
    general = next(s for s in client.get("/api/shifts", headers=hr).json() if s["name"] == "Evening")
    new = client.post("/api/shifts", headers=hr, json={"name": "Temp", "start_time": "10:00", "end_time": "19:00"}).json()
    from conftest import employee_id
    uid = employee_id(client, hr, "sara@attendai.com")
    client.patch(f"/api/employees/{uid}", headers=hr, json={"shift_id": new["id"]})
    assert client.delete(f"/api/shifts/{new['id']}", headers=hr).status_code == 409
    client.patch(f"/api/employees/{uid}", headers=hr, json={"shift_id": 1})
    assert client.delete(f"/api/shifts/{new['id']}", headers=hr).status_code == 204
    assert general


def test_team_crud_and_guard(client, hr, neha):
    assert client.post("/api/departments", headers=neha, json={"name": "Ops"}).status_code == 403
    d = client.post("/api/departments", headers=hr, json={"name": "Operations", "description": "Run things"})
    assert d.status_code == 201
    assert client.post("/api/departments", headers=hr, json={"name": "operations"}).status_code == 409
    did = d.json()["id"]
    assert client.patch(f"/api/departments/{did}", headers=hr, json={"name": "Ops Team"}).json()["name"] == "Ops Team"
    from conftest import employee_id
    uid = employee_id(client, hr, "sara@attendai.com")
    original = client.get(f"/api/employees/{uid}", headers=hr).json()["department"]["id"]
    client.patch(f"/api/employees/{uid}", headers=hr, json={"department_id": did})
    assert client.delete(f"/api/departments/{did}", headers=hr).status_code == 409
    client.patch(f"/api/employees/{uid}", headers=hr, json={"department_id": original})
    assert client.delete(f"/api/departments/{did}", headers=hr).status_code == 204


CSV = """employee_code,full_name,email,date_of_joining,role,department,designation,work_mode,manager_email,shift
IMP001,Anil Kumar,anil@example.com,2026-04-15,employee,Engineering,Developer,hybrid,manager@attendai.com,General
IMP002,Bela Shah,bela@example.com,2026-04-16,,,,,,
"""


def test_csv_import_dry_run_then_real(client, hr, auth):
    dry = client.post("/api/employees/import", headers=hr, json={"csv": CSV, "dry_run": True}).json()
    assert len(dry["created"]) == 2 and not dry["errors"]
    assert not any(e["email"] == "anil@example.com" for e in client.get("/api/employees", headers=hr).json())  # nothing saved
    real = client.post("/api/employees/import", headers=hr, json={"csv": CSV}).json()
    assert len(real["created"]) == 2
    anil = real["created"][0]
    assert len(anil["temp_password"]) >= 8
    login = client.post("/api/auth/login", json={"email": "anil@example.com", "password": anil["temp_password"]})
    assert login.status_code == 200 and login.json()["user"]["department"]["name"] == "Engineering"
    bal = client.get("/api/leave/balances", headers={"Authorization": "Bearer " + login.json()["access_token"]}).json()
    assert any(b["code"] == "CL" and b["allocated"] == 12 for b in bal)  # leave quota was created


def test_csv_import_reports_bad_rows_and_keeps_good_ones(client, hr):
    bad = """employee_code,full_name,email,date_of_joining,role,department,password
OK01,Good Person,good@example.com,2026-04-15,employee,Engineering,
OK01,Duplicate Code,other@example.com,2026-04-15,employee,Engineering,
BAD2,Bad Email,not-an-email,2026-04-15,employee,Engineering,
BAD3,Bad Date,date@example.com,15/04/2026,employee,Engineering,
BAD4,Bad Role,role@example.com,2026-04-15,boss,Engineering,
BAD5,Bad Team,team@example.com,2026-04-15,employee,Nowhere,
BAD6,Short Pw,pw@example.com,2026-04-15,employee,Engineering,abc
"""
    out = client.post("/api/employees/import", headers=hr, json={"csv": bad}).json()
    assert [c["employee_code"] for c in out["created"]] == ["OK01"]
    assert sorted(e["row"] for e in out["errors"]) == [3, 4, 5, 6, 7, 8]
    assert any("already exists" in e["message"] for e in out["errors"])


def test_csv_import_requires_columns_and_hr(client, hr, neha):
    assert client.post("/api/employees/import", headers=hr, json={"csv": "a,b\n1,2\n3,4\n"}).status_code == 400
    assert client.post("/api/employees/import", headers=neha, json={"csv": CSV}).status_code == 403
    admin_row = "employee_code,full_name,email,date_of_joining,role\nADM9,New Admin,adm@example.com,2026-04-15,admin\n"
    out = client.post("/api/employees/import", headers=hr, json={"csv": admin_row}).json()
    assert out["errors"] and "only an admin" in out["errors"][0]["message"]  # HR cannot mint admins


def test_employee_creation_rules(client, hr, manager):
    body = {"employee_code": "NEW01", "full_name": "New Hire", "email": "new@example.com", "password": "Welcome-123", "date_of_joining": "2026-04-15"}
    assert client.post("/api/employees", headers=manager, json=body).status_code == 403
    assert client.post("/api/employees", headers=hr, json=body).status_code == 201
    assert client.post("/api/employees", headers=hr, json=body).status_code == 409
    assert client.post("/api/employees", headers=hr, json={**body, "employee_code": "NEW02", "email": "n2@example.com", "role": "admin"}).status_code == 403
