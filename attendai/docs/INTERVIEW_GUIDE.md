# Explaining AttendAI in an interview

## The 30-second pitch
"AttendAI is an attendance and leave system for an IT company. Employees check in from the browser or phone, optionally with GPS. Managers approve leave and see who is in. HR downloads monthly Excel and PDF reports, and a pandas module turns the data into plain-language insights like which weekday has the most late arrivals. It is React and TypeScript on the front, FastAPI and PostgreSQL on the back, with role-based access enforced on the server."

## The 2-minute walkthrough (demo order)
1. Sign in as **Employee**, check in, show the live dial and the monthly calendar.
2. Apply for leave (show the balance check and that weekends are not charged).
3. Sign in as **Manager**, show the approval queue, approve it, then the dashboard.
4. Sign in as **HR**, add a person, add a holiday, open **Reports**, download Excel and PDF, open **Insights**.
5. Toggle dark mode and open it on a phone width.

## Architecture in one breath
Browser (React) calls a REST API (FastAPI). The API checks a JWT, applies the role rules, and talks to PostgreSQL through SQLAlchemy. Reports use pandas, openpyxl and reportlab on the server.

## Decisions worth being able to defend
- **One attendance row per employee per day**, with a `UNIQUE(employee_id, work_date)` constraint. A double-click or race cannot create duplicates, even if the code check is bypassed.
- **Shift rules live in data** (start, grace, half-day and full-day minutes), so late and overtime logic needs no code change for a new shift.
- **Permissions are checked on the server** with a `require_roles` dependency. Hiding a button in React is only convenience. Managers are also scoped to their own reports in the query.
- **Reports count only completed days**, so nobody is marked absent for a day still in progress. Absent and attendance % in the Excel file are live formulas, so HR can audit them.
- **Passwords are hashed with bcrypt**; tokens are signed JWTs with an expiry. A 401 on the client signs the user out.
- **Insights are rule-based statistics** (group-bys and thresholds in pandas). Say this plainly: it is not a machine-learning model. It is explainable, which is a feature for HR data. If asked how you would add ML: forecast absenteeism from weekday, month and leave history, and keep the rule-based output as the baseline to beat.
- **Server timezone handling:** timestamps are stored as `timestamptz`, and day boundaries are computed in IST.

## Things you built that are worth a story
- **Night shifts.** A shift that ends before it starts runs past midnight, so "today" depends on the shift: at 01:30 a night worker is still on yesterday's row. Show `work_day()` in `attendance.py` and the two night-shift tests.
- **Missed-punch corrections.** Employee asks, manager approves, the server rewrites the times, recalculates late and overtime with the same scoring function as a live punch, and leaves a note on the day. Reusing the scoring function is the point: one rule, two entry paths.
- **Tests on real PostgreSQL.** 55 tests, and they refuse to run against a database whose name lacks "test" because they wipe it. Say why SQLite was not used: enums, arrays and constraints.
- **Face ID liveness.** First version needed a blink, which laptop cameras at a few frames a second often miss. Fix: also accept a head turn, show a live readout of what the camera sees, and add a clearly labelled fallback. Lesson: measure on real hardware, and never make a security control so strict that people cannot use the product.
- **Rate limiting without Redis.** An in-memory counter keyed by email and IP. Say what breaks with several server processes (each counts separately) and what you would do (Redis).

## Questions to expect, and honest answers
**Why FastAPI?** Typed request and response models, automatic validation, free `/docs`, and it sits naturally next to pandas.
**Why PostgreSQL over MongoDB?** The data is relational (employees, managers, shifts, leave) and needs constraints and joins.
**How do you stop someone checking in for a colleague?** Layers. Login first. GPS radius for remote check-ins. A rotating QR on the office screen, signed with HMAC and valid for 45 seconds, so there is nothing to store and a screenshot sent to a friend dies fast. Face ID on top: the server compares a 128-number descriptor with the enrolled one. Be honest about each limit: GPS can be spoofed, a QR can be replayed inside its window, and the blink check runs in the browser so it beats a photo but not a video or a modified client.
**Why do the face matching on the server?** If the browser decided "matched", anyone could call the API and say yes. The browser only produces numbers. The server owns the comparison, the threshold and the lockout (5 failures in 10 minutes).
**Is storing faces legal / safe?** Only numbers are stored, never photos. Enrolment needs explicit consent and the password again, HR can see who enrolled but never the numbers, and anyone can remove theirs. In India the DPDP Act makes biometric consent and purpose limits real, so say you would add a retention policy and a privacy notice before a real rollout.
**How do emails work without slowing requests?** FastAPI BackgroundTasks send after the response. A mail failure is logged, never shown to the user. With no SMTP configured it prints to the console, so development and demos work with no setup.
**How would it scale beyond 100 employees?** Indexes already cover the hot queries. Next: pagination on list endpoints, caching the dashboard stats, background jobs for reports, and a nightly job to write absent rows.
**What would you improve next?** Password reset by email link, a job queue (Celery or RQ) for email, Redis for rate limits and lockouts, active liveness (a random challenge issued and checked by the server), and absent rows written by a nightly job.
**What was hardest?** Pick one you can speak about: the report rules (what counts as a working day, leave overlapping attendance), or timezone handling for check-in.
**Is it secure enough to ship?** For a portfolio, yes with the production settings in the deployment guide. For real use it needs rate limiting on login, password reset, HTTPS only, and tests.

## Known limits (say them before they ask)
Face liveness is client-side only (and has a fallback), rate limits live in one process's memory, and there is no emailed password-reset link. Naming the limits and the plan for them reads as maturity.

## Numbers you can quote
13 tables, about 55 API endpoints, 4 roles, 15 screens, 55 automated tests with CI, 4 check-in methods (web, GPS, QR, Face ID), email plus in-app notifications, Excel and PDF export, light and dark themes, a phone layout.
