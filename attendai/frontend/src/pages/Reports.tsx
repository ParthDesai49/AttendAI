import { Suspense, lazy, useState } from "react";
import { FileSpreadsheet, FileText } from "lucide-react";
import { MonthNav } from "../components/MonthNav";
import { useToast } from "../components/Toast";
import { Avatar, Button, Chips, Empty, ErrorNote, Figures, Loading, PageHeader, Panel, SectionTitle, Select, Tabs } from "../components/ui";
import { useAsync } from "../hooks/useAsync";
import { api, download } from "../lib/api";
import { fmtMinutes, monthKey } from "../lib/format";
import type { Department, Insights, MonthlyReport } from "../lib/types";

const WeekdayChart = lazy(() => import("../components/InsightCharts").then((m) => ({ default: m.WeekdayChart })));
const WeeklyChart = lazy(() => import("../components/InsightCharts").then((m) => ({ default: m.WeeklyChart })));
const pctColor = (p: number) => (p >= 90 ? "bg-present" : p >= 75 ? "bg-late" : "bg-absent");
const onTimeColor = (p: number) => (p >= 85 ? "bg-present" : p >= 70 ? "bg-late" : "bg-absent");
const num = "py-3 pr-4 text-right tabular-nums";

function Monthly() {
  const toast = useToast();
  const [month, setMonth] = useState(monthKey(new Date()));
  const [dept, setDept] = useState("");
  const [busy, setBusy] = useState<"xlsx" | "pdf" | null>(null);
  const departments = useAsync<Department[]>(() => api.get("/api/departments"));
  const query = `month=${month}${dept ? `&department_id=${dept}` : ""}`;
  const report = useAsync<MonthlyReport>(() => api.get(`/api/reports/monthly?${query}`), [query]);
  const r = report.data;

  async function save(format: "xlsx" | "pdf") {
    setBusy(format);
    try {
      await download(`/api/reports/monthly/export?${query}&format=${format}`, `AttendAI-attendance-${month}.${format}`);
      toast.success(format === "xlsx" ? "Excel report downloaded" : "PDF report downloaded");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <MonthNav month={month} onChange={setMonth} />
          <Select aria-label="Filter by team" className="w-48" value={dept} onChange={(e) => setDept(e.target.value)}>
            <option value="">All teams</option>
            {(departments.data ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
        </div>
        <div className="flex gap-2">
          <Button loading={busy === "xlsx"} disabled={!!busy || !r} onClick={() => save("xlsx")}><FileSpreadsheet className="size-4" aria-hidden /> Download Excel</Button>
          <Button loading={busy === "pdf"} disabled={!!busy || !r} onClick={() => save("pdf")}><FileText className="size-4" aria-hidden /> Download PDF</Button>
        </div>
      </div>

      {report.error ? <ErrorNote message={report.error} onRetry={report.reload} /> : !r ? <Loading /> : r.working_days === 0 ? (
        <Empty title="Nothing to report yet" body="A day is added to the report once it has ended." />
      ) : (
        <>
          <Figures items={[
            { value: r.totals.attendance_pct == null ? "–" : `${r.totals.attendance_pct}%`, label: "Attendance rate" },
            { value: String(r.totals.late), label: "Late arrivals" },
            { value: String(r.totals.absent), label: "Absent days" },
            { value: `${r.totals.overtime_hours}h`, label: "Overtime" },
          ]} />
          <div className="mt-10 overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <thead className="text-left text-muted">
                <tr>
                  <th className="py-2 pr-4 font-medium">Person</th>
                  <th className="hidden py-2 pr-4 font-medium md:table-cell">Team</th>
                  <th className="py-2 pr-4 text-right font-medium">Present</th><th className="py-2 pr-4 text-right font-medium">Late</th>
                  <th className="py-2 pr-4 text-right font-medium">Leave</th><th className="py-2 pr-4 text-right font-medium">Absent</th>
                  <th className="py-2 pr-4 text-right font-medium">Avg day</th><th className="w-40 py-2 font-medium">Attendance</th>
                </tr>
              </thead>
              <tbody>
                {r.rows.map((p) => (
                  <tr key={p.employee_id} className="border-t border-line">
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-3">
                        <Avatar name={p.full_name} size={32} />
                        <div><p className="font-medium">{p.full_name}</p><p className="text-xs text-muted">{p.employee_code}</p></div>
                      </div>
                    </td>
                    <td className="hidden py-3 pr-4 text-muted md:table-cell">{p.department ?? "–"}</td>
                    <td className={num}>{p.present} of {p.working_days}</td>
                    <td className={num}>{p.late}</td>
                    <td className={num}>{p.leave}</td>
                    <td className={num}>{p.absent}</td>
                    <td className={num}>{p.avg_hours ? fmtMinutes(p.avg_hours * 60) : "–"}</td>
                    <td className="py-3">
                      {p.attendance_pct == null ? "–" : (
                        <div className="flex items-center gap-2">
                          <span className="w-10 tabular-nums">{Math.round(p.attendance_pct)}%</span>
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken">
                            <div className={`h-full rounded-full ${pctColor(p.attendance_pct)}`} style={{ width: `${p.attendance_pct}%` }} />
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 max-w-2xl text-sm text-muted">
            Only completed working days count, so today is added once it has ended. Attendance is days present divided by working days
            minus approved leave. The Excel file also has a day-by-day log of every check-in.
          </p>
        </>
      )}
    </>
  );
}

function InsightsView() {
  const [days, setDays] = useState<"30" | "60" | "90">("60");
  const { data, error, reload } = useAsync<Insights>(() => api.get(`/api/analytics/insights?days=${days}`), [days]);
  if (error) return <ErrorNote message={error} onRetry={reload} />;
  if (!data) return <Loading label="Looking for patterns" />;

  return (
    <>
      <div className="mb-8">
        <Chips value={days} onChange={setDays} items={[{ id: "30", label: "Last 30 days" }, { id: "60", label: "Last 60 days" }, { id: "90", label: "Last 90 days" }]} />
      </div>
      <Figures items={[
        { value: data.on_time_pct == null ? "–" : `${Math.round(data.on_time_pct)}%`, label: "Check-ins on time" },
        { value: String(data.check_ins), label: "Check-ins analysed" },
        { value: data.avg_hours == null ? "–" : fmtMinutes(data.avg_hours * 60), label: "Average day" },
        { value: `${data.overtime_hours}h`, label: "Overtime logged" },
      ]} />

      <section className="mt-12">
        <SectionTitle>What stands out</SectionTitle>
        <ol className="space-y-5">
          {data.highlights.map((h, i) => (
            <li key={h} className="flex gap-4">
              <span className="w-7 font-display text-2xl font-bold leading-snug text-muted tabular-nums">{i + 1}</span>
              <p className="max-w-2xl text-lg leading-snug">{h}</p>
            </li>
          ))}
        </ol>
      </section>

      {data.check_ins > 0 && (
        <section className="mt-12 grid gap-6 lg:grid-cols-2">
          <Panel className="p-5">
            <SectionTitle>Late arrivals by weekday</SectionTitle>
            <Suspense fallback={<Loading />}><WeekdayChart data={data.by_weekday} /></Suspense>
          </Panel>
          <Panel className="p-5">
            <SectionTitle>Punctuality week by week</SectionTitle>
            <Suspense fallback={<Loading />}><WeeklyChart data={data.weekly} /></Suspense>
          </Panel>
        </section>
      )}

      {data.by_team.length > 0 && (
        <section className="mt-12 grid gap-12 lg:grid-cols-2">
          <div>
            <SectionTitle>On-time rate by team</SectionTitle>
            <ul className="space-y-4">
              {data.by_team.map((t) => (
                <li key={t.team}>
                  <div className="mb-1.5 flex justify-between text-sm">
                    <span className="font-medium">{t.team}</span>
                    <span className="text-muted tabular-nums">{Math.round(t.on_time_pct)}% of {t.arrivals} check-ins</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-sunken">
                    <div className={`h-full rounded-full ${onTimeColor(t.on_time_pct)}`} style={{ width: `${t.on_time_pct}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <SectionTitle>Worth a conversation</SectionTitle>
            {data.attention.length === 0 ? (
              <p className="text-muted">Nobody has stood out in the last two weeks.</p>
            ) : (
              <ul>
                {data.attention.map((a) => (
                  <li key={a.employee_id} className="flex gap-3 border-t border-line py-3 first:border-t-0">
                    <Avatar name={a.name} />
                    <div>
                      <p className="font-medium">{a.name} <span className="font-normal text-muted">in {a.team}</span></p>
                      {a.reasons.map((reason) => <p key={reason} className="text-sm text-muted">{reason}.</p>)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}
    </>
  );
}

export default function Reports() {
  const [tab, setTab] = useState<"monthly" | "insights">("monthly");
  return (
    <>
      <PageHeader title="Reports" subtitle="Monthly summaries to download, and patterns worth acting on." />
      <Tabs value={tab} onChange={setTab} items={[{ id: "monthly", label: "Monthly report" }, { id: "insights", label: "Insights" }]} />
      {tab === "monthly" ? <Monthly /> : <InsightsView />}
    </>
  );
}
