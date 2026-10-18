# AttendAI API reference

Base URL: `http://localhost:8000`. Interactive version with a "Try it out" button: `/docs`.

All endpoints except `/api/auth/login` and `/api/health` need the header `Authorization: Bearer <token>`. Errors come back as `{"detail": "message"}` with a standard status code (400 bad input, 401 not signed in, 403 not allowed, 404 not found, 409 conflict, 422 validation).

Roles: **E** employee, **M** manager, **HR** hr, **A** admin. "Approvers" means M, HR and A. Managers only see their direct reports.

## Auth
| Method | Path | Who | Notes |
|---|---|---|---|
| POST | `/api/auth/login` | public | `{email, password}` returns `{access_token, user}`. Token lasts `TOKEN_MINUTES` (default 480). |
| GET | `/api/auth/me` | all | The signed-in employee. |
| POST | `/api/auth/change-password` | all | `{current_password, new_password}`. 204. Wrong current password returns 400; 5 wrong tries in 10 minutes returns 429. |

Sign-in is limited to 8 wrong passwords per email and address in 15 minutes (429). A wrong email and a wrong password return the same 401 message.

## Employees
| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/api/employees?q=&department_id=` | approvers | Managers get their reports only. |
| POST | `/api/employees` | HR, A | Creates the account and yearly leave balances. Only an admin can create an admin. 409 if email or code exists. |
| GET | `/api/employees/{id}` | all | Employees can only read themselves. |
| PATCH | `/api/employees/{id}` | HR, A | Partial update: name, phone, role, team, manager, shift, designation, work mode, status. |
| GET | `/api/departments` | all | |
| GET | `/api/shifts` | all | |

## Attendance
| Method | Path | Who | Notes |
|---|---|---|---|
| POST | `/api/attendance/check-in` | all | `{method: "web"|"geo", latitude?, longitude?, work_mode?}`. Geo check-in is rejected outside the office radius. One check-in per day (also enforced by a unique constraint). |
| POST | `/api/attendance/check-out` | all | Computes worked, early-leave and overtime minutes. |
| GET | `/api/attendance/today` | all | Today's record or `null`. |
| GET | `/api/attendance/me?month=YYYY-MM` | all | Own history. |
| GET | `/api/attendance/daily?day=YYYY-MM-DD` | approvers | Everyone in scope, including people who have not checked in. |
| GET | `/api/attendance/stats` | approvers | Counts for today. |
| GET | `/api/attendance/trend?days=14` | approvers | On time / late / absent per working day. |

## Leave
| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/api/leave/types` | all | |
| GET | `/api/leave/balances` | all | Own balances this year. |
| POST | `/api/leave` | all | `{leave_type_id, start_date, end_date, is_half_day, reason}`. Rejects overlaps and insufficient balance; weekends and holidays are not charged. |
| GET | `/api/leave/me` | all | Own requests. |
| POST | `/api/leave/{id}/cancel` | owner | Pending requests only. |
| GET | `/api/leave/pending` | approvers | Managers see their reports' requests. |
| POST | `/api/leave/{id}/review` | approvers | `{approve, note}`. Cannot review your own request. Approval deducts the balance. |

| POST | `/api/employees/import` | HR, A | `{csv, dry_run}`. Required columns: `employee_code, full_name, email, date_of_joining`. Optional: `role, department, designation, work_mode, shift, manager_email, phone, password`. Returns per-row results; bad rows are skipped and explained. `dry_run: true` saves nothing. |
| POST | `/api/employees/{id}/reset-password` | HR, A | `{new_password}`. Notifies and emails the person. Only an admin can reset an admin. |

## Corrections (missed punches)
| Method | Path | Who | Notes |
|---|---|---|---|
| POST | `/api/corrections` | all | `{work_date, check_in?, check_out?, reason}`. Past days within 31 days only. One pending request per day (409). |
| GET | `/api/corrections/me` | all | Own requests. |
| POST | `/api/corrections/{id}/cancel` | owner | Pending only. |
| GET | `/api/corrections/pending` | approvers | Managers see their reports; HR and admin see all. Includes the currently recorded times. |
| POST | `/api/corrections/{id}/review` | approvers | `{approve, note}`. Approval writes the times (method `manual`), recalculates late / overtime and adds a note to the day. Cannot review your own request. |

## Shifts and teams (HR, A)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/shifts/usage`, `/api/departments/usage` | Each with the number of people using it. |
| POST | `/api/shifts` | `{name, start_time, end_time, grace_minutes, half_day_minutes, full_day_minutes}`. End before start means a night shift. |
| PATCH / DELETE | `/api/shifts/{id}` | Cannot delete the default shift or one in use (409). `is_default` moves the default. |
| POST | `/api/departments` | `{name, description}`. 409 on a duplicate name. |
| PATCH / DELETE | `/api/departments/{id}` | Cannot delete a team that still has people (409). |

## Holidays
| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/api/holidays?year=` | all | |
| POST | `/api/holidays` | HR, A | `{holiday_date, name, is_optional}`. 409 on a duplicate date. |
| DELETE | `/api/holidays/{id}` | HR, A | 204 on success. |

## Reports and analytics (approvers)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/reports/monthly?month=&department_id=` | One row per person plus totals. Only completed working days count. |
| GET | `/api/reports/monthly/export?month=&department_id=&format=xlsx|pdf` | File download. |
| GET | `/api/analytics/insights?days=60` | Highlights, late rate by weekday, team on-time rate, weekly trend, people worth a conversation. |

## QR, Face ID and notifications
| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/api/qr/token` | HR, A | `{token, expires_in, office}`. Token is `office.expiry.HMAC` and lasts `QR_TOKEN_SECONDS` (45). The kiosk fetches a new one before it expires. |
| POST | `/api/attendance/qr-punch` | all | `{token}`. First scan checks in, second checks out, third returns 400. Returns `{action, attendance}`. 400 for an invalid or expired code. |
| POST | `/api/attendance/check-out` | all | Plain check-out used by the dashboard. |
| GET | `/api/face/status` | all | `{enrolled, enrolled_at}`. |
| POST | `/api/face/enroll` | all | `{descriptors: [2-6 x 128 floats], consent: true, password}`. Re-checks the password, rejects samples that do not agree with each other, stores their mean. |
| POST | `/api/attendance/face-punch` | all | `{descriptor, work_mode?}`. Match when Euclidean distance <= `FACE_MATCH_THRESHOLD` (0.5). 403 on no match, 429 after 5 failures in 10 minutes, 400 if not enrolled. |
| DELETE | `/api/face/me` | all | Removes your own Face ID. |
| GET | `/api/face/enrolled` | HR, A | Who has enrolled. Never returns the numbers. |
| DELETE | `/api/face/{employee_id}` | HR, A | Removes someone's Face ID and notifies them. |
| GET | `/api/notifications?limit=15` | all | `{unread, items}`. |
| POST | `/api/notifications/read-all` | all | 204. |
| POST | `/api/notifications/{id}/read` | owner | 204. 404 for someone else's. |
| GET | `/api/notifications/email-status` | HR, A | `{mode: smtp|console|off, from_address, host}`. |
| POST | `/api/notifications/test-email` | HR, A | Sends to yourself. 502 with the real error if the mail server fails. |

## System
| GET | `/api/health` | public | `{"status": "ok"}` for uptime checks. |
