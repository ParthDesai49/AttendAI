import { Suspense, lazy } from "react";
import { Link } from "react-router-dom";
import { CheckInCard } from "../components/CheckInCard";
import { DailyTable } from "../components/DailyTable";
import { AtAGlance, ByDepartment } from "../components/TeamOverview";
import { btn, Empty, ErrorNote, Figures, Loading, PageHeader, Panel, SectionTitle, StatusBadge } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useAsync } from "../hooks/useAsync";
import { api } from "../lib/api";
import { fmtDate, fmtMinutes, fmtTime, greeting, summarize } from "../lib/format";
import type { Attendance, DailyRow, LeaveBalance, PendingLeave, Stats, TrendPoint } from "../lib/types";

const TrendChart = lazy(() => import("../components/TrendChart"));
const link = "text-sm font-medium underline underline-offset-4";

const Legend = () => (
  <ul className="flex gap-4 text-xs text-muted">
    {[["On time", "bg-present"], ["Late", "bg-late"], ["Absent", "bg-absent"]].map(([label, color]) => (
      <li key={label} className="flex items-center gap-1.5"><span className={`size-2.5 rounded-sm ${color}`} aria-hidden />{label}</li>
    ))}
  </ul>
);

export default function Dashboard() {
  const { user, isApprover } = useAuth();
  const today = useAsync<Attendance | null>(() => api.get("/api/attendance/today"));
  const month = useAsync<Attendance[]>(() => api.get("/api/attendance/me"));
  const balances = useAsync<LeaveBalance[]>(() => api.get("/api/leave/balances"));
  const stats = useAsync<Stats | null>(() => (isApprover ? api.get<Stats>("/api/attendance/stats") : Promise.resolve(null)), [isApprover]);
  const trend = useAsync<TrendPoint[]>(() => (isApprover ? api.get<TrendPoint[]>("/api/attendance/trend?days=14") : Promise.resolve([])), [isApprover]);
  const daily = useAsync<DailyRow[]>(() => (isApprover ? api.get<DailyRow[]>("/api/attendance/daily") : Promise.resolve([])), [isApprover]);
  const pending = useAsync<PendingLeave[]>(() => (isApprover ? api.get<PendingLeave[]>("/api/leave/pending") : Promise.resolve([])), [isApprover]);

  const refresh = () => { today.reload(); month.reload(); stats.reload(); daily.reload(); trend.reload(); };
  const rows = month.data ?? [];
  const m = summarize(rows);
  const waiting = pending.data?.length ?? 0;

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${user?.full_name.split(" ")[0] ?? ""}`}
        subtitle={new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
      />
      {today.error && <div className="mb-4"><ErrorNote message={today.error} onRetry={today.reload} /></div>}

      <div className={isApprover ? "grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]" : undefined}>
        <CheckInCard attendance={today.data} onChanged={refresh} />
        {isApprover && (stats.data ? <AtAGlance stats={stats.data} /> : <Panel className="p-6"><Loading /></Panel>)}
      </div>

      {isApprover && (
        <>
          {waiting > 0 && (
            <Panel className="mt-6 flex flex-wrap items-center justify-between gap-3 p-4 pl-5">
              <p className="font-medium">{waiting} leave {waiting === 1 ? "request is" : "requests are"} waiting for your decision.</p>
              <Link to="/leave?tab=approvals" className={btn("primary")}>Review requests</Link>
            </Panel>
          )}
          <section className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <Panel className="p-5">
              <SectionTitle aside={<Legend />}>Last two weeks</SectionTitle>
              <Suspense fallback={<Loading />}>{trend.data ? <TrendChart data={trend.data} /> : <Loading />}</Suspense>
            </Panel>
            <Panel className="p-5">
              <SectionTitle>Teams today</SectionTitle>
              {daily.data ? <ByDepartment rows={daily.data} /> : <Loading />}
            </Panel>
          </section>
          <section className="mt-10">
            <SectionTitle>Today's attendance</SectionTitle>
            {daily.data ? <DailyTable rows={daily.data} /> : <Loading />}
          </section>
        </>
      )}

      <section className="mt-12">
        <SectionTitle>Your month so far</SectionTitle>
        <Figures items={[
          { value: String(m.present), label: "Days present" },
          { value: String(m.late), label: "Late arrivals" },
          { value: fmtMinutes(m.avg), label: "Average day" },
          { value: fmtMinutes(m.overtime), label: "Overtime" },
        ]} />
      </section>

      <div className="mt-12 grid gap-10 lg:grid-cols-2">
        <section>
          <SectionTitle aside={<Link to="/leave" className={link}>Apply for leave</Link>}>Leave left this year</SectionTitle>
          {balances.data?.length ? (
            <ul className="space-y-5">
              {balances.data.map((b) => (
                <li key={b.code}>
                  <div className="mb-1.5 flex justify-between text-sm">
                    <span className="font-medium">{b.type}</span>
                    <span className="text-muted tabular-nums">{b.remaining} of {b.allocated} days left</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-sunken">
                    <div className="h-full rounded-full bg-leave" style={{ width: `${b.allocated ? (b.remaining / b.allocated) * 100 : 0}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : balances.loading ? <Loading /> : <Empty title="No leave balance yet" body="Ask HR to set up your leave quota." />}
        </section>

        <section>
          <SectionTitle aside={<Link to="/attendance" className={link}>See the full month</Link>}>Recent days</SectionTitle>
          {rows.length ? (
            <ul>
              {rows.slice(0, 6).map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 border-t border-line py-3 text-sm first:border-t-0">
                  <div>
                    <p className="font-medium">{fmtDate(r.work_date, { weekday: "short", day: "numeric", month: "short" })}</p>
                    <p className="text-muted tabular-nums">
                      {r.check_in ? `${fmtTime(r.check_in)} to ${r.check_out ? fmtTime(r.check_out) : "now"}` : "No check-in"}
                    </p>
                  </div>
                  <StatusBadge status={r.status} />
                </li>
              ))}
            </ul>
          ) : month.loading ? <Loading /> : <Empty title="Nothing recorded this month" body="Check in above and your days will show up here." />}
        </section>
      </div>
    </>
  );
}
