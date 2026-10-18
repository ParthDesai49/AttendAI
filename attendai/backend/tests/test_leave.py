from datetime import date, timedelta

import pytest


def next_monday(weeks=2):
    d = date.today() + timedelta(weeks=weeks)
    return d - timedelta(days=d.weekday())


def apply(client, headers, start, end=None, type_id=1, half=False, reason="Family function"):
    return client.post("/api/leave", headers=headers, json={"leave_type_id": type_id, "start_date": str(start), "end_date": str(end or start), "is_half_day": half, "reason": reason})


def test_weekends_are_not_charged(client, neha):
    mon = next_monday(3)
    r = apply(client, neha, mon, mon + timedelta(days=6))  # Mon..Sun = 5 working days
    assert r.status_code == 201 and r.json()["days"] == 5
    client.post(f"/api/leave/{r.json()['id']}/cancel", headers=neha)


def test_validation(client, neha):
    mon = next_monday(4)
    assert apply(client, neha, mon + timedelta(days=1), mon).status_code == 400  # ends before it starts
    assert apply(client, neha, mon, mon + timedelta(days=1), half=True).status_code == 400
    assert apply(client, neha, mon + timedelta(days=5)).status_code == 400  # a Saturday
    assert apply(client, neha, mon, type_id=999).status_code == 404


def test_overlap_and_balance(client, neha):
    mon = next_monday(5)
    first = apply(client, neha, mon, mon + timedelta(days=1))
    assert first.status_code == 201
    assert apply(client, neha, mon + timedelta(days=1)).status_code == 409
    client.post(f"/api/leave/{first.json()['id']}/cancel", headers=neha)
    big = apply(client, neha, mon, mon + timedelta(weeks=4))  # 20 working days against a 12 day quota
    assert big.status_code == 400 and "Insufficient" in big.json()["detail"]


def test_approval_flow_deducts_balance_and_notifies(client, neha, manager, outbox):
    mon = next_monday(6)
    before = {b["code"]: b["remaining"] for b in client.get("/api/leave/balances", headers=neha).json()}
    r = apply(client, neha, mon, mon + timedelta(days=1))
    lid = r.json()["id"]
    assert any(m["to"] == "manager@attendai.com" for m in outbox)  # the manager is told
    assert any("asked for leave" in n["title"] for n in client.get("/api/notifications", headers=manager).json()["items"])
    assert lid in [p["id"] for p in client.get("/api/leave/pending", headers=manager).json()]
    assert client.post(f"/api/leave/{lid}/review", headers=neha, json={"approve": True}).status_code == 403  # not an approver
    assert client.post(f"/api/leave/{lid}/review", headers=manager, json={"approve": True, "note": "Enjoy"}).status_code == 200
    after = {b["code"]: b["remaining"] for b in client.get("/api/leave/balances", headers=neha).json()}
    assert after["CL"] == before["CL"] - 2
    assert any("approved" in n["title"] for n in client.get("/api/notifications", headers=neha).json()["items"])
    assert any(m["to"] == "neha@attendai.com" and "approved" in m["subject"] for m in outbox)
    assert client.post(f"/api/leave/{lid}/review", headers=manager, json={"approve": False}).status_code == 400  # already decided


def test_rejection_keeps_balance(client, neha, manager):
    mon = next_monday(7)
    before = {b["code"]: b["remaining"] for b in client.get("/api/leave/balances", headers=neha).json()}
    lid = apply(client, neha, mon).json()["id"]
    assert client.post(f"/api/leave/{lid}/review", headers=manager, json={"approve": False, "note": "Release week"}).status_code == 200
    assert {b["code"]: b["remaining"] for b in client.get("/api/leave/balances", headers=neha).json()} == before


def test_nobody_reviews_their_own_leave_and_managers_only_see_their_team(client, manager, hr, neha):
    mon = next_monday(8)
    mine = apply(client, manager, mon).json()["id"]
    assert client.post(f"/api/leave/{mine}/review", headers=manager, json={"approve": True}).status_code == 403
    assert client.post(f"/api/leave/{mine}/review", headers=hr, json={"approve": True}).status_code == 200  # HR can
    theirs = apply(client, hr, mon + timedelta(days=7)).json()["id"]  # Priya is not Rohan's report
    assert theirs not in [p["id"] for p in client.get("/api/leave/pending", headers=manager).json()]
    assert client.post(f"/api/leave/{theirs}/review", headers=manager, json={"approve": True}).status_code == 403


def test_only_pending_own_requests_can_be_cancelled(client, neha, karan):
    lid = apply(client, neha, next_monday(9)).json()["id"]
    assert client.post(f"/api/leave/{lid}/cancel", headers=karan).status_code == 404
    assert client.post(f"/api/leave/{lid}/cancel", headers=neha).status_code == 200
    assert client.post(f"/api/leave/{lid}/cancel", headers=neha).status_code == 400
