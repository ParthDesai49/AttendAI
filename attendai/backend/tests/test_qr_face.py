import math
import random

from app import security
from conftest import PASSWORD


# ---------------- QR
def test_qr_scan_checks_in_then_out_then_refuses(client, hr, neha):
    tok = client.get("/api/qr/token", headers=hr).json()["token"]
    a = client.post("/api/attendance/qr-punch", headers=neha, json={"token": tok}).json()
    assert a["action"] == "check_in" and a["attendance"]["check_in_method"] == "qr" and a["attendance"]["work_mode"] == "office"
    b = client.post("/api/attendance/qr-punch", headers=neha, json={"token": tok}).json()
    assert b["action"] == "check_out" and b["attendance"]["check_out"]
    assert client.post("/api/attendance/qr-punch", headers=neha, json={"token": tok}).status_code == 400


def test_qr_rejects_tampered_expired_forged_and_garbage(client, hr, karan):
    tok = client.get("/api/qr/token", headers=hr).json()["token"]
    tampered = tok[:-3] + ("aaa" if not tok.endswith("aaa") else "bbb")
    r = client.post("/api/attendance/qr-punch", headers=karan, json={"token": tampered})
    assert r.status_code == 400 and "not a valid" in r.json()["detail"]
    r = client.post("/api/attendance/qr-punch", headers=karan, json={"token": security.make_qr_token(1, seconds=-5)})
    assert r.status_code == 400 and "expired" in r.json()["detail"]
    loc, exp, sig = tok.split(".")
    assert client.post("/api/attendance/qr-punch", headers=karan, json={"token": f"{loc}.{int(exp) + 9999}.{sig}"}).status_code == 400  # extending the expiry breaks the signature
    assert client.post("/api/attendance/qr-punch", headers=karan, json={"token": "garbage"}).status_code in (400, 422)
    assert client.post("/api/attendance/qr-punch", json={"token": tok}).status_code in (401, 403)


def test_qr_token_is_for_hr_only_and_expires_in_45_seconds(client, neha, hr):
    assert client.get("/api/qr/token", headers=neha).status_code == 403
    assert client.get("/api/qr/token", headers=hr).json()["expires_in"] == 45


# ---------------- Face ID
random.seed(7)
BASE = [random.uniform(-0.3, 0.3) for _ in range(128)]


def near(eps):
    return [v + random.uniform(-eps, eps) for v in BASE]


def far():
    return [random.uniform(-0.3, 0.3) for _ in range(128)]


def enroll(client, headers, samples=None, **over):
    body = {"descriptors": samples or [near(0.01) for _ in range(3)], "consent": True, "password": PASSWORD, **over}
    return client.post("/api/face/enroll", headers=headers, json=body)


def test_enrolment_needs_consent_password_and_consistent_samples(client, neha):
    assert enroll(client, neha, consent=False).status_code == 400
    assert enroll(client, neha, password="wrong-pass").status_code == 403
    assert enroll(client, neha, samples=[BASE, far()]).status_code == 400  # two different people
    assert enroll(client, neha, samples=[BASE]).status_code == 422  # at least two samples
    assert client.get("/api/face/status", headers=neha).json()["enrolled"] is False


def test_face_punch_matches_and_toggles(client, neha):
    assert client.post("/api/attendance/face-punch", headers=neha, json={"descriptor": BASE}).status_code == 400  # not enrolled yet
    assert enroll(client, neha).status_code in (200, 201, 204)
    assert client.get("/api/face/status", headers=neha).json()["enrolled"] is True
    a = client.post("/api/attendance/face-punch", headers=neha, json={"descriptor": near(0.02)}).json()
    assert a["action"] == "check_in" and a["attendance"]["check_in_method"] == "face"
    assert client.post("/api/attendance/face-punch", headers=neha, json={"descriptor": near(0.02)}).json()["action"] == "check_out"


def test_wrong_face_is_refused_and_locks_after_five_misses(client, neha):
    enroll(client, neha)
    for _ in range(5):
        assert client.post("/api/attendance/face-punch", headers=neha, json={"descriptor": far()}).status_code == 403
    assert client.post("/api/attendance/face-punch", headers=neha, json={"descriptor": near(0.01)}).status_code == 429  # even the right face waits


def test_bad_descriptors_can_never_match(client, neha):
    enroll(client, neha)
    for bad in ([math.nan] * 128, [math.inf] * 128, [0.0] * 127, [50.0] * 128):
        try:
            r = client.post("/api/attendance/face-punch", headers=neha, json={"descriptor": bad})
        except ValueError:  # the client itself cannot encode NaN as JSON, which is fine
            continue
        assert r.status_code in (403, 422), r.text


def test_faces_are_per_person(client, neha, karan):
    enroll(client, neha)
    assert client.post("/api/attendance/face-punch", headers=karan, json={"descriptor": BASE}).status_code == 400  # karan has none


def test_hr_sees_who_enrolled_but_never_the_numbers_and_can_remove(client, hr, neha):
    enroll(client, neha)
    rows = client.get("/api/face/enrolled", headers=hr).json()
    assert any(r["full_name"] == "Neha Joshi" for r in rows) and "descriptor" not in str(rows)
    assert client.get("/api/face/enrolled", headers=neha).status_code == 403
    uid = next(r["employee_id"] for r in rows if r["full_name"] == "Neha Joshi")
    assert client.delete(f"/api/face/{uid}", headers=hr).status_code in (200, 204)
    assert client.get("/api/face/status", headers=neha).json()["enrolled"] is False
    assert any("Face ID" in n["title"] for n in client.get("/api/notifications", headers=neha).json()["items"])


def test_person_can_remove_their_own_face(client, neha):
    enroll(client, neha)
    assert client.delete("/api/face/me", headers=neha).status_code in (200, 204)
    assert client.get("/api/face/status", headers=neha).json()["enrolled"] is False
