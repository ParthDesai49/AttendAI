import { useState } from "react";
import { Link } from "react-router-dom";
import { ClipboardPen } from "lucide-react";
import { DailyTable } from "../components/DailyTable";
import { MonthNav } from "../components/MonthNav";
import { btn, cx, DOT, ErrorNote, Field, Figures, Input, Loading, PageHeader, SectionTitle, StatusBadge, Tabs, TINT } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useAsync } from "../hooks/useAsync";
import { api } from "../lib/api";
import { fmtDate, fmtMinutes, fmtTime, isoDate, monthKey, parseDate, shiftMonth, STATUS, summarize } from "../lib/format";
import type { Attendance, DailyRow } from "../lib/types";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const LEGEND = [["On time", "present"], ["Late", "late"], ["Absent", "absent"], ["On leave", "leave"]] as const;

function MonthCalendar({ month, rows }: { month: string; rows: Attendance[] }) {
  const [y, m] = month.split("-").map(Number);
  const offset = (new Date(y, m - 1, 1).getDay() + 6) % 7; // weeks start on Monday
  const days = new Date(y, m, 0).getDate();
  const byDate = new Map(rows.map((r) => [r.work_date, r]));
  const todayIso = isoDate(new Date());

  return (
    <div>
      <div className="mb-1.5 grid grid-cols-7 gap-1.5 text-center text-xs text-muted">
        {WEEKDAYS.map((d) => <span key={d}>{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: offset }, (_, i) => <span key={`gap-${i}`} />)}
        {Array.from({ length: days }, (_, i) => {
          const day = i + 1;
          const iso = `${month}-${String(day).padStart(2, "0")}`;
          const r = byDate.get(iso);
          const weekend = [0, 6].includes(new Date(y, m - 1, day).getDay());
          const label = r ? `${fmtDate(iso)}: ${STATUS[r.status].label}${r.check_in ? `, ${fmtTime(r.check_in)} to ${fmtTime(r.check_out)}` : ""}` : fmtDate(iso);
          return (
            <div key={iso} title={label} aria-label={label}
              className={cx("flex aspect-square flex-col justify-between rounded-lg p-1.5 text-sm sm:aspect-[5/4] sm:p-2",
                r ? TINT[STATUS[r.status].tone] : weekend ? "bg-sunken/60 text-muted" : "border border-line bg-surface",
                iso > todayIso && "opacity-45", iso === todayIso && "ring-2 ring-ink")}>
              <span className="font-medium">{day}</span>
              {r?.check_in && <span className="hidden text-xs tabular-nums sm:block">{fmtTime(r.check_in)}</span>}
            </div>
          );
        })}
      </div>
      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">
        {LEGEND.map(([label, tone]) => (
          <li key={label} className="flex items-center gap-1.5"><span className={`size-2.5 rounded-sm ${DOT[tone]}`} aria-hidden />{label}</li>
        ))}
      </ul>
    </div>
  );
}

function MyAttendance() {
  const [month, setMonth] = useState(monthKey(new Date()));
  const { data, loading, error, reload } = useAsync<Attendance[]>(() => api.get(`/api/attendance/me?month=${month}`), [month]);
  const rows = data ?? [];
  const s = summarize(rows);

  return (
    <>
      <div className="mb-6"><MonthNav month={month} onChange={setMonth} /></div>
      {error && <div className="mb-6"><ErrorNote message={error} onRetry={reload} /></div>}
      <Figures items={[
        { value: String(s.present), label: "Days present" },
        { value: String(s.late), label: "Late arrivals" },
        { value: String(s.absent), label: "Days absent" },
        { value: fmtMinutes(s.avg), label: "Average day" },
      ]} />
      <section className="mt-10"><MonthCalendar month={month} rows={rows} /></section>
      <section className="mt-10">
        <SectionTitle>Day by day</SectionTitle>
        {loading && !data ? <Loading /> : rows.length === 0 ? (
          <p className="text-muted">Nothing was recorded this month.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-sm">
              <thead className="text-left text-muted">
                <tr>
                  <th className="py-2 pr-4 font-medium">Date</th><th className="py-2 pr-4 font-medium">In</th>
                  <th className="py-2 pr-4 font-medium">Out</th><th className="py-2 pr-4 font-medium">Worked</th>
                  <th className="py-2 pr-4 font-medium">Late by</th><th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-line">
                    <td className="py-3 pr-4 font-medium">{fmtDate(r.work_date, { weekday: "short", day: "numeric", month: "short" })}</td>
                    <td className="py-3 pr-4 tabular-nums">{fmtTime(r.check_in)}</td>
                    <td className="py-3 pr-4 tabular-nums">{fmtTime(r.check_out)}</td>
                    <td className="py-3 pr-4 tabular-nums">{r.worked_minutes ? fmtMinutes(r.worked_minutes) : "–"}</td>
                    <td className="py-3 pr-4 tabular-nums">{r.late_minutes ? fmtMinutes(r.late_minutes) : "–"}</td>
                    <td className="py-3"><StatusBadge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function TeamAttendance() {
  const [day, setDay] = useState(isoDate(new Date()));
  const { data, error, reload } = useAsync<DailyRow[]>(() => api.get(`/api/attendance/daily?day=${day}`), [day]);
  return (
    <>
      <div className="mb-6 max-w-xs">
        <Field label="Date">
          <Input type="date" max={isoDate(new Date())} value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
        </Field>
      </div>
      {error ? <ErrorNote message={error} onRetry={reload} /> : data ? <DailyTable rows={data} /> : <Loading />}
    </>
  );
}

export default function AttendancePage() {
  const { isApprover } = useAuth();
  const [tab, setTab] = useState<"mine" | "team">("mine");
  return (
    <>
      <PageHeader title="Attendance" subtitle="Your days at work, and your team's if you manage people."
        actions={<Link to="/corrections" className={btn("secondary")}><ClipboardPen className="size-4" aria-hidden /> Missed a punch?</Link>} />
      {isApprover && <Tabs value={tab} onChange={setTab} items={[{ id: "mine", label: "My attendance" }, { id: "team", label: "Team" }]} />}
      {tab === "team" && isApprover ? <TeamAttendance /> : <MyAttendance />}
    </>
  );
}
