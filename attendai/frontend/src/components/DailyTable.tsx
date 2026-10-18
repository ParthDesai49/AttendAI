import { useState } from "react";
import { Search } from "lucide-react";
import { fmtMinutes, fmtTime, IN_OFFICE } from "../lib/format";
import type { DailyRow } from "../lib/types";
import { Avatar, Chips, Empty, Input, StatusBadge } from "./ui";

type Filter = "all" | "in" | "late" | "leave" | "out";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Everyone" }, { id: "in", label: "In" }, { id: "late", label: "Late" },
  { id: "leave", label: "On leave" }, { id: "out", label: "Not in yet" },
];
const match = (r: DailyRow, f: Filter) =>
  f === "all" ||
  (f === "in" && IN_OFFICE.includes(r.status)) ||
  (f === "late" && r.status === "late") ||
  (f === "leave" && r.status === "on_leave") ||
  (f === "out" && (r.status === "not_marked" || r.status === "absent"));

export function DailyTable({ rows }: { rows: DailyRow[] }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const shown = rows.filter((r) => match(r, filter) && `${r.full_name} ${r.employee_code}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Chips value={filter} onChange={setFilter} items={FILTERS} />
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted" aria-hidden />
          <Input aria-label="Search people" placeholder="Search by name or ID" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      {shown.length === 0 ? (
        <Empty title="No one matches" body="Try a different filter or search." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead className="text-left text-muted">
              <tr>
                <th className="py-2 pr-4 font-medium">Person</th>
                <th className="hidden py-2 pr-4 font-medium md:table-cell">Team</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">In</th>
                <th className="py-2 pr-4 font-medium">Out</th>
                <th className="py-2 text-right font-medium">Worked</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.employee_id} className="border-t border-line">
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-3">
                      <Avatar name={r.full_name} size={32} />
                      <div>
                        <p className="font-medium">{r.full_name}</p>
                        <p className="text-xs text-muted">{r.employee_code}</p>
                      </div>
                    </div>
                  </td>
                  <td className="hidden py-3 pr-4 text-muted md:table-cell">{r.department ?? "–"}</td>
                  <td className="py-3 pr-4"><StatusBadge status={r.status} /></td>
                  <td className="py-3 pr-4 tabular-nums">{fmtTime(r.check_in)}</td>
                  <td className="py-3 pr-4 tabular-nums">{fmtTime(r.check_out)}</td>
                  <td className="py-3 text-right tabular-nums">{r.worked_minutes ? fmtMinutes(r.worked_minutes) : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
