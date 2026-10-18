from conftest import PASSWORD


def test_login_ok_and_me(client, neha):
    r = client.post("/api/auth/login", json={"email": "NEHA@attendai.com", "password": PASSWORD})  # email is case-insensitive
    assert r.status_code == 200 and r.json()["user"]["full_name"] == "Neha Joshi"
    assert client.get("/api/auth/me", headers=neha).json()["role"] == "employee"


def test_wrong_password_is_401_with_same_message_as_unknown_email(client):
    a = client.post("/api/auth/login", json={"email": "neha@attendai.com", "password": "nope-nope-1"})
    b = client.post("/api/auth/login", json={"email": "ghost@attendai.com", "password": "nope-nope-1"})
    assert a.status_code == b.status_code == 401 and a.json() == b.json()


def test_login_is_throttled_after_repeated_failures(client):
    for _ in range(8):
        assert client.post("/api/auth/login", json={"email": "karan@attendai.com", "password": "wrong-pass-1"}).status_code == 401
    r = client.post("/api/auth/login", json={"email": "karan@attendai.com", "password": PASSWORD})
    assert r.status_code == 429  # even the right password is refused while paused


def test_protected_routes_need_a_token(client):
    assert client.get("/api/attendance/today").status_code in (401, 403)
    assert client.get("/api/attendance/today", headers={"Authorization": "Bearer garbage"}).status_code == 401


def test_roles_are_enforced(client, neha, manager, hr):
    assert client.get("/api/reports/monthly?month=2026-05", headers=neha).status_code == 403
    assert client.post("/api/employees", headers=manager, json={}).status_code == 403
    assert client.get("/api/qr/token", headers=neha).status_code == 403
    assert client.get("/api/qr/token", headers=hr).status_code == 200


def test_change_password(client, auth):
    email = "sara@attendai.com"
    h = auth(email)
    assert client.post("/api/auth/change-password", headers=h, json={"current_password": "wrong-one", "new_password": "Brand-New-1"}).status_code == 400
    assert client.post("/api/auth/change-password", headers=h, json={"current_password": PASSWORD, "new_password": PASSWORD}).status_code == 400
    assert client.post("/api/auth/change-password", headers=h, json={"current_password": PASSWORD, "new_password": "short"}).status_code == 422
    assert client.post("/api/auth/change-password", headers=h, json={"current_password": PASSWORD, "new_password": "Brand-New-1"}).status_code == 204
    assert client.post("/api/auth/login", json={"email": email, "password": PASSWORD}).status_code == 401
    assert client.post("/api/auth/login", json={"email": email, "password": "Brand-New-1"}).status_code == 200
    client.post("/api/auth/change-password", headers=h, json={"current_password": "Brand-New-1", "new_password": PASSWORD})  # put it back


def test_hr_can_reset_a_password_and_person_is_told(client, hr, outbox):
    from conftest import employee_id
    uid = employee_id(client, hr, "vivek@attendai.com")
    assert client.post(f"/api/employees/{uid}/reset-password", headers=hr, json={"new_password": "Temp-Pass-9"}).status_code == 204
    assert client.post("/api/auth/login", json={"email": "vivek@attendai.com", "password": "Temp-Pass-9"}).status_code == 200
    assert any("password was reset" in m["subject"] for m in outbox)
    client.post(f"/api/employees/{uid}/reset-password", headers=hr, json={"new_password": PASSWORD})
