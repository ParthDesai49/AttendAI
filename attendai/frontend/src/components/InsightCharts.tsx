import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useChartColors } from "../hooks/useChartColors";
import { fmtDate } from "../lib/format";
import type { Insights } from "../lib/types";

export function WeekdayChart({ data }: { data: Insights["by_weekday"] }) {
  const c = useChartColors();
  const worst = Math.max(...data.map((d) => d.late_rate));
  const tick = { fill: c.muted, fontSize: 12 };
  return (
    <div className="h-56" role="img" aria-label="Share of arrivals that were late, for each weekday">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 0, left: -18, bottom: 0 }} barCategoryGap="30%">
          <CartesianGrid vertical={false} stroke={c.line} />
          <XAxis dataKey="day" tickLine={false} axisLine={false} tick={tick} />
          <YAxis tickLine={false} axisLine={false} tick={tick} tickFormatter={(v: number) => `${v}%`} />
          <Tooltip cursor={{ fill: c.sunken }} formatter={(v) => `${v}%`}
            contentStyle={{ background: c.surface, border: `1px solid ${c.line}`, borderRadius: 12, color: c.ink }} />
          <Bar dataKey="late_rate" name="Late arrivals" radius={[6, 6, 0, 0]}>
            {data.map((d) => <Cell key={d.day} fill={worst > 0 && d.late_rate === worst ? c.late : c.muted} fillOpacity={worst > 0 && d.late_rate === worst ? 1 : 0.45} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function WeeklyChart({ data }: { data: Insights["weekly"] }) {
  const c = useChartColors();
  const tick = { fill: c.muted, fontSize: 12 };
  return (
    <div className="h-56" role="img" aria-label="Share of on-time arrivals, week by week">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={c.line} />
          <XAxis dataKey="week" tickLine={false} axisLine={false} tick={tick} tickFormatter={(w: string) => fmtDate(w)} />
          <YAxis domain={[(min: number) => Math.max(0, Math.floor(min / 10) * 10 - 10), 100]} tickLine={false} axisLine={false}
            tick={tick} tickFormatter={(v: number) => `${v}%`} />
          <Tooltip labelFormatter={(w) => `Week of ${fmtDate(String(w))}`} formatter={(v) => `${v}%`}
            contentStyle={{ background: c.surface, border: `1px solid ${c.line}`, borderRadius: 12, color: c.ink }} />
          <Line type="monotone" dataKey="on_time_pct" name="On time" stroke={c.present} strokeWidth={2.5} dot={{ r: 3, fill: c.present, strokeWidth: 0 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
