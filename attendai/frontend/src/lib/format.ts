import type { Attendance, AttStatus } from "./types";

const pad = (n: number) => String(n).padStart(2, "0");

export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseDate = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase() : "–";

export const fmtDate = (s: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) =>
  parseDate(s).toLocaleDateString("en-IN", opts);

export const fmtRange = (start: string, end: string) =>
  start === end ? fmtDate(start, { day: "numeric", month: "short", year: "numeric" })
    : `${fmtDate(start)} to ${fmtDate(end, { day: "numeric", month: "short", year: "numeric" })}`;

export function fmtMinutes(m: number) {
  if (!m || m < 1) return "0m";
  const h = Math.floor(m / 60), r = Math.round(m % 60);
  return h ? (r ? `${h}h ${r}m` : `${h}h`) : `${r}m`;
}

/** "09:30:00" -> "9:30 am" */
export function fmtShift(t: string) {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${pad(m)} ${h >= 12 ? "pm" : "am"}`;
}

export const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

export const monthKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
export function shiftMonth(key: string, delta: number) {
  const [y, m] = key.split("-").map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
}

export const ROLE_LABEL = { admin: "Admin", hr: "HR", manager: "Manager", employee: "Employee" } as const;
export const MODE_LABEL = { office: "Office", wfh: "Work from home", hybrid: "Hybrid" } as const;

export type Tone = "present" | "late" | "absent" | "leave" | "idle";
export const STATUS: Record<AttStatus, { label: string; tone: Tone }> = {
  present: { label: "On time", tone: "present" },
  late: { label: "Late", tone: "late" },
  half_day: { label: "Half day", tone: "late" },
  absent: { label: "Absent", tone: "absent" },
  on_leave: { label: "On leave", tone: "leave" },
  holiday: { label: "Holiday", tone: "idle" },
  weekend: { label: "Weekend", tone: "idle" },
  not_marked: { label: "Not in yet", tone: "idle" },
};
export const IN_OFFICE: AttStatus[] = ["present", "late", "half_day"];

export function summarize(rows: Attendance[]) {
  const worked = rows.filter((r) => r.worked_minutes > 0);
  return {
    present: rows.filter((r) => IN_OFFICE.includes(r.status)).length,
    late: rows.filter((r) => r.status === "late").length,
    absent: rows.filter((r) => r.status === "absent").length,
    avg: worked.length ? Math.round(worked.reduce((s, r) => s + r.worked_minutes, 0) / worked.length) : 0,
    overtime: rows.reduce((s, r) => s + r.overtime_minutes, 0),
  };
}

export function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  return d < 7 ? `${d} d ago` : fmtDate(iso.slice(0, 10), { day: "numeric", month: "short" });
}

/** A shift that ends at or before it starts runs past midnight. */
export const isOvernight = (start: string, end: string) => end <= start;
