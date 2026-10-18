export type Role = "admin" | "hr" | "manager" | "employee";
export type WorkMode = "office" | "wfh" | "hybrid";
export type EmpStatus = "active" | "on_notice" | "inactive";
export type AttStatus = "present" | "late" | "half_day" | "absent" | "on_leave" | "holiday" | "weekend" | "not_marked";
export type RequestStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface Department { id: number; name: string; description?: string | null }
export interface Shift {
  id: number; name: string; start_time: string; end_time: string; grace_minutes: number;
  half_day_minutes?: number; full_day_minutes?: number; is_default?: boolean;
}

export interface Employee {
  id: number; employee_code: string; full_name: string; email: string; phone: string | null;
  role: Role; designation: string | null; work_mode: WorkMode; status: EmpStatus;
  date_of_joining: string; manager_id: number | null; department: Department | null; shift: Shift | null;
}

export interface Attendance {
  id: number; employee_id: number; work_date: string; check_in: string | null; check_out: string | null;
  check_in_method: string | null; status: AttStatus; work_mode: WorkMode;
  late_minutes: number; early_leave_minutes: number; worked_minutes: number; overtime_minutes: number;
}

export interface DailyRow {
  employee_id: number; employee_code: string; full_name: string; department: string | null; status: AttStatus;
  check_in: string | null; check_out: string | null; late_minutes: number; worked_minutes: number;
}
export interface Stats { total: number; present: number; late: number; on_leave: number; not_checked_in: number }
export interface TrendPoint { date: string; present: number; late: number; absent: number }

export interface LeaveType { id: number; name: string; code: string; is_paid: boolean }
export interface LeaveBalance { type: string; code: string; allocated: number; used: number; remaining: number }
export interface LeaveRequest {
  id: number; employee_id: number; leave_type_id: number; start_date: string; end_date: string;
  is_half_day: boolean; days: number; reason: string | null; status: RequestStatus;
  review_note: string | null; created_at: string;
}
export interface PendingLeave extends LeaveRequest { employee_name: string; leave_type: string }
export interface LoginResponse { access_token: string; token_type: string; user: Employee }

export interface MonthlyRow {
  employee_id: number; employee_code: string; full_name: string; department: string | null;
  working_days: number; present: number; late: number; half_days: number; leave: number; absent: number;
  hours: number; avg_hours: number; overtime_hours: number; attendance_pct: number | null;
}
export interface MonthlyReport {
  month: string; working_days: number; rows: MonthlyRow[];
  totals: { late: number; absent: number; leave: number; overtime_hours: number; attendance_pct: number | null };
}
export interface Insights {
  period_days: number; check_ins: number; on_time_pct: number | null; avg_hours: number | null; overtime_hours: number;
  highlights: string[];
  by_weekday: { day: string; arrivals: number; late_rate: number }[];
  by_team: { team: string; arrivals: number; on_time_pct: number }[];
  weekly: { week: string; on_time_pct: number; avg_hours: number }[];
  attention: { employee_id: number; name: string; team: string; late_days: number; reasons: string[] }[];
}
export interface Holiday { id: number; holiday_date: string; name: string; is_optional: boolean }

export interface PunchResult { action: "check_in" | "check_out"; attendance: Attendance }
export interface NotificationItem { id: number; title: string; message: string; link: string | null; is_read: boolean; created_at: string }
export interface NotificationList { unread: number; items: NotificationItem[] }
export interface EmailStatus { mode: "smtp" | "console" | "off"; from_address: string; host: string | null }
export interface FaceStatus { enrolled: boolean; enrolled_at: string | null }
export interface FaceEnrolled { employee_id: number; employee_code: string; full_name: string; enrolled_at: string }

export interface Correction {
  id: number; employee_id: number; work_date: string; requested_check_in: string | null; requested_check_out: string | null;
  reason: string; status: RequestStatus; created_at: string;
}
export interface PendingCorrection extends Correction {
  employee_name: string; current_check_in: string | null; current_check_out: string | null;
}
export interface ImportResult {
  dry_run: boolean;
  created: { row: number; employee_code: string; full_name: string; email: string; temp_password: string }[];
  errors: { row: number; message: string }[];
}
