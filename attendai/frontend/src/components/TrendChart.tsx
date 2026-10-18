import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useChartColors } from "../hooks/useChartColors";
import { fmtDate } from "../lib/format";
import type { TrendPoint } from "../lib/types";

export default function TrendChart({ data }: { data: TrendPoint[] }) {
  const c = useChartColors();
  const rows = data.map((d) => ({ ...d, day: fmtDate(d.date) }));
  const tick = { fill: c.muted, fontSize: 12 };
  return (
    <div className="h-64" role="img" aria-label="People on time, late and absent for each working day over the last two weeks">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 0, left: -24, bottom: 0 }} barCategoryGap="30%">
          <CartesianGrid vertical={false} stroke={c.line} />
          <XAxis dataKey="day" tickLine={false} axisLine={false} tick={tick} interval="preserveStartEnd" />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={tick} />
          <Tooltip
            cursor={{ fill: c.sunken }}
            contentStyle={{ background: c.surface, border: `1px solid ${c.line}`, borderRadius: 12, color: c.ink }}
          />
          <Bar dataKey="present" name="On time" stackId="a" fill={c.present} />
          <Bar dataKey="late" name="Late" stackId="a" fill={c.late} />
          <Bar dataKey="absent" name="Absent" stackId="a" fill={c.absent} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
