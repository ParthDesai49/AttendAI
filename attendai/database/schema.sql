-- =====================================================================
-- AttendAI - PostgreSQL schema (PostgreSQL 12+)
-- Run:  createdb attendai
--       psql -d attendai -f database/schema.sql
-- =====================================================================

-- ---------- Enums ----------
CREATE TYPE user_role         AS ENUM ('admin','hr','manager','employee');
CREATE TYPE employee_status   AS ENUM ('active','on_notice','inactive');
CREATE TYPE work_mode         AS ENUM ('office','wfh','hybrid');
CREATE TYPE attendance_status AS ENUM ('present','late','half_day','absent','on_leave','holiday','weekend');
CREATE TYPE check_method      AS ENUM ('web','geo','qr','manual','face');
CREATE TYPE request_status    AS ENUM ('pending','approved','rejected','cancelled');

-- ---------- Reference tables ----------
CREATE TABLE departments (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(80) NOT NULL UNIQUE,
  description TEXT,
  head_id     INT,                                  -- FK added after employees exists
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE shifts (
  id               SERIAL PRIMARY KEY,
  name             VARCHAR(50) NOT NULL UNIQUE,
  start_time       TIME NOT NULL,
  end_time         TIME NOT NULL,
  grace_minutes    INT  NOT NULL DEFAULT 15,        -- late only after this grace
  half_day_minutes INT  NOT NULL DEFAULT 240,       -- worked < this => absent
  full_day_minutes INT  NOT NULL DEFAULT 480,       -- worked < this => half day; above => overtime
  is_default       BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE office_locations (                     -- used for geo-fenced check-in
  id        SERIAL PRIMARY KEY,
  name      VARCHAR(80) NOT NULL,
  latitude  NUMERIC(9,6) NOT NULL,
  longitude NUMERIC(9,6) NOT NULL,
  radius_m  INT NOT NULL DEFAULT 150,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE leave_types (
  id                SERIAL PRIMARY KEY,
  name              VARCHAR(50) NOT NULL UNIQUE,
  code              VARCHAR(10) NOT NULL UNIQUE,
  annual_quota      NUMERIC(5,1) NOT NULL DEFAULT 0,
  is_paid           BOOLEAN NOT NULL DEFAULT TRUE,
  carry_forward_max NUMERIC(5,1) NOT NULL DEFAULT 0
);

CREATE TABLE holidays (
  id           SERIAL PRIMARY KEY,
  holiday_date DATE NOT NULL UNIQUE,
  name         VARCHAR(100) NOT NULL,
  is_optional  BOOLEAN NOT NULL DEFAULT FALSE
);

-- ---------- Employees (also the login accounts) ----------
CREATE TABLE employees (
  id              SERIAL PRIMARY KEY,
  employee_code   VARCHAR(20)  NOT NULL UNIQUE,
  full_name       VARCHAR(120) NOT NULL,
  email           VARCHAR(160) NOT NULL,
  phone           VARCHAR(20),
  password_hash   TEXT NOT NULL,
  role            user_role       NOT NULL DEFAULT 'employee',
  department_id   INT REFERENCES departments(id) ON DELETE SET NULL,
  manager_id      INT REFERENCES employees(id)   ON DELETE SET NULL,
  shift_id        INT REFERENCES shifts(id),
  designation     VARCHAR(80),
  work_mode       work_mode       NOT NULL DEFAULT 'office',
  status          employee_status NOT NULL DEFAULT 'active',
  date_of_joining DATE NOT NULL,
  date_of_birth   DATE,
  avatar_url      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_employees_email     ON employees (lower(email));
CREATE INDEX        idx_employees_dept     ON employees (department_id);
CREATE INDEX        idx_employees_manager  ON employees (manager_id);

ALTER TABLE departments
  ADD CONSTRAINT fk_departments_head
  FOREIGN KEY (head_id) REFERENCES employees(id) ON DELETE SET NULL;

-- ---------- Attendance (one row per employee per day) ----------
CREATE TABLE attendance (
  id                  BIGSERIAL PRIMARY KEY,
  employee_id         INT  NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  work_date           DATE NOT NULL,
  check_in            TIMESTAMPTZ,
  check_out           TIMESTAMPTZ,
  check_in_method     check_method,
  check_out_method    check_method,
  check_in_lat        NUMERIC(9,6),
  check_in_lng        NUMERIC(9,6),
  location_id         INT REFERENCES office_locations(id),
  work_mode           work_mode NOT NULL DEFAULT 'office',
  status              attendance_status NOT NULL DEFAULT 'present',
  late_minutes        INT NOT NULL DEFAULT 0,
  early_leave_minutes INT NOT NULL DEFAULT 0,
  worked_minutes      INT NOT NULL DEFAULT 0,
  overtime_minutes    INT NOT NULL DEFAULT 0,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_attendance_emp_date UNIQUE (employee_id, work_date),
  CONSTRAINT chk_attendance_times   CHECK (check_out IS NULL OR check_in IS NULL OR check_out >= check_in)
);
CREATE INDEX idx_attendance_date        ON attendance (work_date);
CREATE INDEX idx_attendance_status_date ON attendance (status, work_date);

-- Missed punch / correction requests
CREATE TABLE regularizations (
  id                 SERIAL PRIMARY KEY,
  employee_id        INT  NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  work_date          DATE NOT NULL,
  requested_check_in  TIMESTAMPTZ,
  requested_check_out TIMESTAMPTZ,
  reason             TEXT NOT NULL,
  status             request_status NOT NULL DEFAULT 'pending',
  reviewed_by        INT REFERENCES employees(id),
  reviewed_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Leave management ----------
CREATE TABLE leave_balances (
  id            SERIAL PRIMARY KEY,
  employee_id   INT NOT NULL REFERENCES employees(id)   ON DELETE CASCADE,
  leave_type_id INT NOT NULL REFERENCES leave_types(id),
  year          SMALLINT NOT NULL,
  allocated     NUMERIC(5,1) NOT NULL DEFAULT 0,
  used          NUMERIC(5,1) NOT NULL DEFAULT 0 CHECK (used >= 0),
  UNIQUE (employee_id, leave_type_id, year)
);

CREATE TABLE leave_requests (
  id            SERIAL PRIMARY KEY,
  employee_id   INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type_id INT NOT NULL REFERENCES leave_types(id),
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  is_half_day   BOOLEAN NOT NULL DEFAULT FALSE,
  days          NUMERIC(4,1) NOT NULL CHECK (days > 0),
  reason        TEXT,
  status        request_status NOT NULL DEFAULT 'pending',
  reviewed_by   INT REFERENCES employees(id),
  reviewed_at   TIMESTAMPTZ,
  review_note   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_leave_dates CHECK (end_date >= start_date)
);
CREATE INDEX idx_leave_emp_status ON leave_requests (employee_id, status);
CREATE INDEX idx_leave_dates      ON leave_requests (start_date, end_date);

-- ---------- Notifications & audit ----------
CREATE TABLE notifications (
  id          BIGSERIAL PRIMARY KEY,
  employee_id INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  title       VARCHAR(120) NOT NULL,
  message     TEXT NOT NULL,
  link        VARCHAR(200),                        -- where the notification takes you in the app
  is_read     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_unread ON notifications (employee_id, is_read);

-- Face ID: a 128-number description of the face (never a photo), one per employee.
CREATE TABLE face_templates (
  id          SERIAL PRIMARY KEY,
  employee_id INT NOT NULL UNIQUE REFERENCES employees(id) ON DELETE CASCADE,
  descriptor  DOUBLE PRECISION[] NOT NULL,
  consented_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id         BIGSERIAL PRIMARY KEY,
  actor_id   INT REFERENCES employees(id) ON DELETE SET NULL,
  action     VARCHAR(60) NOT NULL,
  entity     VARCHAR(60) NOT NULL,
  entity_id  INT,
  details    JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Auto-update updated_at ----------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_employees_updated
  BEFORE UPDATE ON employees
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- Analytics view (powers dashboard + reports) ----------
CREATE VIEW v_monthly_attendance_summary AS
SELECT e.id AS employee_id,
       e.full_name,
       e.department_id,
       date_trunc('month', a.work_date)::date AS month,
       COUNT(*) FILTER (WHERE a.status IN ('present','late','half_day')) AS days_worked,
       COUNT(*) FILTER (WHERE a.status = 'late')     AS late_days,
       COUNT(*) FILTER (WHERE a.status = 'absent')   AS absent_days,
       COUNT(*) FILTER (WHERE a.status = 'on_leave') AS leave_days,
       ROUND(COALESCE(SUM(a.worked_minutes),0)   / 60.0, 1) AS total_hours,
       ROUND(COALESCE(SUM(a.overtime_minutes),0) / 60.0, 1) AS overtime_hours
FROM employees e
JOIN attendance a ON a.employee_id = e.id
GROUP BY e.id, e.full_name, e.department_id, date_trunc('month', a.work_date);

-- ---------- Seed data ----------
INSERT INTO shifts (name, start_time, end_time, grace_minutes, is_default) VALUES
  ('General', '09:30', '18:30', 15, TRUE),
  ('Morning', '07:00', '16:00', 15, FALSE),
  ('Evening', '14:00', '23:00', 15, FALSE);

INSERT INTO leave_types (name, code, annual_quota, is_paid, carry_forward_max) VALUES
  ('Casual Leave', 'CL', 12, TRUE,  0),
  ('Sick Leave',   'SL',  8, TRUE,  0),
  ('Earned Leave', 'EL', 15, TRUE, 10),
  ('Comp Off',     'CO',  0, TRUE,  0),
  ('Loss of Pay',  'LOP', 0, FALSE, 0);

INSERT INTO departments (name, description) VALUES
  ('Engineering', 'Software development and QA'),
  ('Data & Analytics', 'Data science, BI and analytics'),
  ('HR & Admin', 'People operations'),
  ('Sales & Support', 'Clients and customer success');

INSERT INTO office_locations (name, latitude, longitude, radius_m) VALUES
  ('Head Office - Ahmedabad', 23.022505, 72.571362, 150);

INSERT INTO holidays (holiday_date, name) VALUES
  ('2026-10-02', 'Gandhi Jayanti'),
  ('2026-12-25', 'Christmas');
-- HR can add more holidays from the app (Republic Day, Independence Day, Diwali, ...).
