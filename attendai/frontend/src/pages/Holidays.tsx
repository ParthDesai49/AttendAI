import { useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { useToast } from "../components/Toast";
import { Badge, Button, Empty, ErrorNote, Field, Input, Loading, Modal } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useAsync } from "../hooks/useAsync";
import { api } from "../lib/api";
import { isoDate, parseDate } from "../lib/format";
import type { Holiday } from "../lib/types";

function AddHoliday({ year, onClose, onSaved }: { year: number; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [date, setDate] = useState(`${year}-01-01`);
  const [name, setName] = useState("");
  const [optional, setOptional] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.post("/api/holidays", { holiday_date: date, name: name.trim(), is_optional: optional });
      toast.success("Holiday added");
      onSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Add holiday" footer={
      <>
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" form="holiday-form" variant="primary" loading={busy}>Add holiday</Button>
      </>
    }>
      <form id="holiday-form" onSubmit={submit} className="space-y-4">
        <Field label="Date"><Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Name"><Input required minLength={2} maxLength={100} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={optional} onChange={(e) => setOptional(e.target.checked)} className="mt-0.5 size-4 accent-[var(--hero)]" />
          <span>Optional holiday<span className="block text-muted">Employees can choose to take it, so it still counts as a working day.</span></span>
        </label>
        {error && <p role="alert" className="rounded-lg border border-absent/40 bg-absent/10 px-3 py-2 text-sm">{error}</p>}
      </form>
    </Modal>
  );
}

export function HolidaysPanel() {
  const { isHR } = useAuth();
  const toast = useToast();
  const [year, setYear] = useState(new Date().getFullYear());
  const [adding, setAdding] = useState(false);
  const { data, error, reload } = useAsync<Holiday[]>(() => api.get(`/api/holidays?year=${year}`), [year]);
  const today = isoDate(new Date());
  const list = data ?? [];
  const next = year === new Date().getFullYear() ? list.find((h) => h.holiday_date >= today) : undefined;

  async function remove(h: Holiday) {
    try {
      await api.delete(`/api/holidays/${h.id}`);
      toast.success("Holiday removed");
      reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const away = next ? Math.round((parseDate(next.holiday_date).getTime() - parseDate(today).getTime()) / 86400000) : 0;
  const when = away === 0 ? "today" : away === 1 ? "tomorrow" : `in ${away} days`;
  const groups: Record<string, Holiday[]> = {};
  list.forEach((h) => {
    const month = parseDate(h.holiday_date).toLocaleDateString("en-IN", { month: "long" });
    (groups[month] ||= []).push(h);
  });
  const step = "rounded-lg border border-line p-2 hover:bg-sunken";

  return (
    <>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button aria-label="Previous year" className={step} onClick={() => setYear(year - 1)}><ChevronLeft className="size-4" /></button>
          <h2 className="min-w-20 text-center font-display text-xl font-semibold">{year}</h2>
          <button aria-label="Next year" className={step} onClick={() => setYear(year + 1)}><ChevronRight className="size-4" /></button>
        </div>
        {isHR && <Button variant="primary" onClick={() => setAdding(true)}><Plus className="size-4" aria-hidden /> Add holiday</Button>}
      </div>

      {next && (
        <p className="mb-8 text-lg">
          The next holiday is <span className="font-semibold">{next.name}</span> on{" "}
          {parseDate(next.holiday_date).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}, {when}.
        </p>
      )}

      {error ? <ErrorNote message={error} onRetry={reload} /> : !data ? <Loading /> : list.length === 0 ? (
        <Empty title={`No holidays in ${year} yet`} body={isHR ? "Use Add holiday to build the calendar." : "HR has not added any holidays for this year."} />
      ) : (
        <div className="space-y-8">
          {Object.entries(groups).map(([month, items]) => (
            <section key={month}>
              <h3 className="mb-1 font-display text-lg font-semibold text-muted">{month}</h3>
              <ul>
                {items.map((h) => (
                  <li key={h.id} className="flex items-center gap-4 border-t border-line py-3 first:border-t-0">
                    <span className="w-12 text-center">
                      <span className="block font-display text-2xl font-bold leading-none">{parseDate(h.holiday_date).getDate()}</span>
                      <span className="text-xs text-muted">{parseDate(h.holiday_date).toLocaleDateString("en-IN", { weekday: "short" })}</span>
                    </span>
                    <span className="flex-1 font-medium">{h.name}</span>
                    {h.is_optional && <Badge>Optional</Badge>}
                    {isHR && (
                      <button aria-label={`Remove ${h.name}`} onClick={() => remove(h)} className="rounded-lg p-2 text-muted hover:bg-sunken hover:text-absent">
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {adding && <AddHoliday year={year} onClose={() => setAdding(false)} onSaved={reload} />}
    </>
  );
}
