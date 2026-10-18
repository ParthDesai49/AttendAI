# AttendAI - Database Design

```mermaid
erDiagram
  DEPARTMENTS ||--o{ EMPLOYEES : "has"
  EMPLOYEES ||--o{ EMPLOYEES : "manages"
  SHIFTS ||--o{ EMPLOYEES : "assigned to"
  EMPLOYEES ||--o{ ATTENDANCE : "records"
  OFFICE_LOCATIONS ||--o{ ATTENDANCE : "geo check-in"
  EMPLOYEES ||--o{ REGULARIZATIONS : "requests"
  EMPLOYEES ||--o{ LEAVE_REQUESTS : "applies"
  LEAVE_TYPES ||--o{ LEAVE_REQUESTS : "type of"
  EMPLOYEES ||--o{ LEAVE_BALANCES : "holds"
  LEAVE_TYPES ||--o{ LEAVE_BALANCES : "tracks"
  EMPLOYEES ||--o{ NOTIFICATIONS : "receives"
  EMPLOYEES ||--o| FACE_TEMPLATES : "enrols"
  EMPLOYEES ||--o{ AUDIT_LOGS : "performs"

  EMPLOYEES {
    int id PK
    string employee_code UK
    string email UK
    enum role "admin|hr|manager|employee"
    int department_id FK
    int manager_id FK
    int shift_id FK
    enum work_mode "office|wfh|hybrid"
    date date_of_joining
  }
  ATTENDANCE {
    bigint id PK
    int employee_id FK
    date work_date "UNIQUE with employee_id"
    timestamptz check_in
    timestamptz check_out
    enum status
    int late_minutes
    int worked_minutes
    int overtime_minutes
  }
  LEAVE_REQUESTS {
    int id PK
    int employee_id FK
    int leave_type_id FK
    date start_date
    date end_date
    enum status "pending|approved|rejected|cancelled"
    int reviewed_by FK
  }
  SHIFTS {
    int id PK
    time start_time
    time end_time
    int grace_minutes
  }
```

## Interview talking points
- **One row per employee per day** (`UNIQUE(employee_id, work_date)`) prevents duplicate check-ins at the database level, not just in code.
- **Employees table doubles as login accounts**, with a role enum driving role-based access (Admin, HR, Manager, Employee).
- **Self-referencing `manager_id`** gives the approval chain for leave and attendance corrections.
- **Shift rules live in data** (grace, half-day, full-day minutes), so late and overtime logic needs no code change per shift.
- **`CHECK` constraints** guard data integrity (`end_date >= start_date`, `check_out >= check_in`).
- **Indexed for the common queries**: daily attendance by date, per-employee history, pending leave by employee.
- **`v_monthly_attendance_summary` view** feeds the dashboard and Excel/PDF reports, and the pandas analytics later.
- **Audit log with JSONB details** records who changed what.
- **`face_templates` stores 128 numbers, not images**, one row per employee (`UNIQUE employee_id`), with the consent time. Deleting the employee cascades to it. `check_method` gained `qr` and `face`.
- **`notifications` has an optional `link`**, so a bell item can open the leave page directly.
