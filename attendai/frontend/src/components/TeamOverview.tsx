import { IN_OFFICE } from "../lib/format";
import type { DailyRow, Stats } from "../lib/types";
import { Panel } from "./ui";

export function AtAGlance({ stats }: { stats: Stats }) {
  const parts = [
    { key: "On time", n: stats.present - stats.late, color: "bg-present" },
    { key: "Late", n: stats.late, color: "bg-late" },
    { key: "On leave", n: stats.on_leave, color: "bg-leave" },
    { key: "Not in yet", n: stats.not_checked_in, color: "bg-idle" },
  ];
  const summary = parts.map((p) => `${p.n} ${p.key.toLowerCase()}`).join(", ");
  return (
    <Panel className="flex flex-col justify-between gap-6 p-6">
      <div>
        <h2 className="font-display text-2xl font-semibold leading-tight tracking-tight">
          {stats.present} of {stats.total} people are in today
        </h2>
        <p className="mt-1 text-sm text-muted">{stats.late ? `${stats.late} arrived late.` : "Nobody has arrived late."}</p>
      </div>
      <div role="img" aria-label={summary} className="flex h-4 gap-0.5 overflow-hidden rounded-full bg-sunken">
        {parts.map((p) => p.n > 0 && <div key={p.key} className={p.color} style={{ width: `${(p.n / Math.max(stats.total, 1)) * 100}%` }} />)}
      </div>
      <ul className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        {parts.map((p) => (
          <li key={p.key} className="flex items-center gap-2">
            <span className={`size-2.5 rounded-sm ${p.color}`} aria-hidden />
            {p.key}
            <span className="ml-auto font-semibold tabular-nums">{p.n}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function ByDepartment({ rows }: { rows: DailyRow[] }) {
  const groups = new Map<string, { total: number; inOffice: number }>();
  rows.forEach((r) => {
    const key = r.department ?? "No team";
    const g = groups.get(key) ?? { total: 0, inOffice: 0 };
    g.total += 1;
    if (IN_OFFICE.includes(r.status)) g.inOffice += 1;
    groups.set(key, g);
  });
  return (
    <ul className="space-y-4">
      {[...groups.entries()].sort((a, b) => b[1].total - a[1].total).map(([name, g]) => (
        <li key={name}>
          <div className="mb-1.5 flex justify-between text-sm">
            <span className="font-medium">{name}</span>
            <span className="text-muted tabular-nums">{g.inOffice} of {g.total}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-sunken">
            <div className="h-full rounded-full bg-present" style={{ width: `${(g.inOffice / g.total) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
