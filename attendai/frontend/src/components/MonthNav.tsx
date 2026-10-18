import { ChevronLeft, ChevronRight } from "lucide-react";
import { monthKey, parseDate, shiftMonth } from "../lib/format";

export function MonthNav({ month, onChange }: { month: string; onChange: (month: string) => void }) {
  const isCurrent = month === monthKey(new Date());
  const step = "rounded-lg border border-line p-2 hover:bg-sunken disabled:opacity-40";
  return (
    <div className="flex items-center gap-2">
      <button aria-label="Previous month" className={step} onClick={() => onChange(shiftMonth(month, -1))}><ChevronLeft className="size-4" /></button>
      <h2 className="min-w-44 text-center font-display text-xl font-semibold">
        {parseDate(`${month}-01`).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
      </h2>
      <button aria-label="Next month" className={step} disabled={isCurrent} onClick={() => onChange(shiftMonth(month, 1))}><ChevronRight className="size-4" /></button>
    </div>
  );
}
