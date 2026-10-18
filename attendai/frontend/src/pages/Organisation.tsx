import { useState, type FormEvent } from "react";
import { Moon, Pencil, Plus, Trash2 } from "lucide-react";
import { useToast } from "../components/Toast";
import { Badge, Button, Empty, ErrorNote, Field, Input, Loading, Modal, PageHeader, Panel, SectionTitle, Textarea } from "../components/ui";
import { useAsync } from "../hooks/useAsync";
import { api } from "../lib/api";
import { fmtShift, isOvernight } from "../lib/format";
import type { Department, Shift } from "../lib/types";

const hm = (t: string) => t.slice(0, 5);
const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

function ShiftModal({ shift, onClose, onSaved }: { shift: Shift | "new"; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const cur = shift === "new" ? null : shift;
  const [f, setF] = useState({
    name: cur?.name ?? "", start_time: cur ? hm(cur.start_time) : "09:30", end_time: cur ? hm(cur.end_time) : "18:30",
    grace_minutes: String(cur?.grace_minutes ?? 15), half_day_minutes: String(cur?.half_day_minutes ?? 240), full_day_minutes: String(cur?.full_day_minutes ?? 480),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));
  const night = isOvernight(f.start_time, f.end_time);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const body = { name: f.name.trim(), start_time: f.start_time, end_time: f.end_time, grace_minutes: Number(f.grace_minutes), half_day_minutes: Number(f.half_day_minutes), full_day_minutes: Number(f.full_day_minutes) };
    try {
      if (cur) await api.patch(`/api/shifts/${cur.id}`, body); else await api.post("/api/shifts", body);
      toast.success(cur ? "Shift saved" : "Shift added");
      onSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={cur ? "Edit shift" : "Add shift"} footer={
      <>
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" form="shift-form" variant="primary" loading={busy}>{cur ? "Save shift" : "Add shift"}</Button>
      </>
    }>
      <form id="shift-form" onSubmit={submit} className="grid grid-cols-2 gap-4">
        <div className="col-span-2"><Field label="Name"><Input required minLength={2} maxLength={50} value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Night support" /></Field></div>
        <Field label="Starts"><Input type="time" required value={f.start_time} onChange={(e) => set("start_time", e.target.value)} /></Field>
        <Field label="Ends"><Input type="time" required value={f.end_time} onChange={(e) => set("end_time", e.target.value)} /></Field>
        {night && <p className="col-span-2 -mt-2 flex items-center gap-2 text-sm text-muted"><Moon className="size-4" aria-hidden /> This shift ends the next morning. Attendance counts for the day it started.</p>}
        <Field label="Grace (minutes)" hint="Late only after this."><Input type="number" min={0} max={120} required value={f.grace_minutes} onChange={(e) => set("grace_minutes", e.target.value)} /></Field>
        <div />
        <Field label="Half day (minutes)" hint="Under this is absent."><Input type="number" min={30} max={720} required value={f.half_day_minutes} onChange={(e) => set("half_day_minutes", e.target.value)} /></Field>
        <Field label="Full day (minutes)" hint="Beyond this is overtime."><Input type="number" min={60} max={960} required value={f.full_day_minutes} onChange={(e) => set("full_day_minutes", e.target.value)} /></Field>
        {error && <p role="alert" className="col-span-2 rounded-lg border border-absent/40 bg-absent/10 px-3 py-2 text-sm">{error}</p>}
      </form>
    </Modal>
  );
}

function Shifts() {
  const toast = useToast();
  const shifts = useAsync<Shift[]>(() => api.get("/api/shifts"));
  const usage = useAsync<Record<string, number>>(() => api.get("/api/shifts/usage"));
  const [editing, setEditing] = useState<Shift | "new" | null>(null);
  const reload = () => { shifts.reload(); usage.reload(); };

  async function makeDefault(s: Shift) {
    try { await api.patch(`/api/shifts/${s.id}`, { is_default: true }); toast.success(`${s.name} is now the default`); reload(); } catch (e) { toast.error((e as Error).message); }
  }
  async function remove(s: Shift) {
    if (!window.confirm(`Delete the ${s.name} shift?`)) return;
    try { await api.delete(`/api/shifts/${s.id}`); toast.success("Shift deleted"); reload(); } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <section>
      <SectionTitle aside={<Button variant="primary" onClick={() => setEditing("new")}><Plus className="size-4" aria-hidden /> Add shift</Button>}>Shifts</SectionTitle>
      {shifts.error ? <ErrorNote message={shifts.error} onRetry={shifts.reload} /> : !shifts.data ? <Loading /> : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {shifts.data.map((s) => (
            <li key={s.id}>
              <Panel className="flex h-full flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="flex items-center gap-2 font-semibold">{s.name}{isOvernight(s.start_time, s.end_time) && <Moon className="size-4 text-muted" aria-label="Overnight" />}</p>
                    <p className="font-display text-xl font-bold tabular-nums">{fmtShift(s.start_time)} – {fmtShift(s.end_time)}</p>
                  </div>
                  {s.is_default && <Badge tone="mark">Default</Badge>}
                </div>
                <p className="mt-1 text-sm text-muted">Late after {s.grace_minutes} min · {people(usage.data?.[String(s.id)] ?? 0)}</p>
                <div className="mt-3 flex flex-wrap gap-2 pt-1">
                  <Button className="h-8" onClick={() => setEditing(s)}><Pencil className="size-3.5" aria-hidden /> Edit</Button>
                  {!s.is_default && <Button className="h-8" onClick={() => makeDefault(s)}>Make default</Button>}
                  {!s.is_default && <Button variant="ghost" className="h-8" aria-label={`Delete ${s.name}`} onClick={() => remove(s)}><Trash2 className="size-3.5" aria-hidden /></Button>}
                </div>
              </Panel>
            </li>
          ))}
        </ul>
      )}
      {editing && <ShiftModal key={editing === "new" ? "new" : editing.id} shift={editing} onClose={() => setEditing(null)} onSaved={reload} />}
    </section>
  );
}

function TeamModal({ team, onClose, onSaved }: { team: Department | "new"; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const cur = team === "new" ? null : team;
  const [name, setName] = useState(cur?.name ?? "");
  const [desc, setDesc] = useState(cur?.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body = { name: name.trim(), description: desc.trim() || null };
      if (cur) await api.patch(`/api/departments/${cur.id}`, body); else await api.post("/api/departments", body);
      toast.success(cur ? "Team saved" : "Team added");
      onSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title={cur ? "Edit team" : "Add team"} footer={
      <>
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" form="team-form" variant="primary" loading={busy}>{cur ? "Save team" : "Add team"}</Button>
      </>
    }>
      <form id="team-form" onSubmit={submit} className="space-y-4">
        <Field label="Team name"><Input required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="What does it do?" hint="Optional."><Textarea maxLength={300} value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
        {error && <p role="alert" className="rounded-lg border border-absent/40 bg-absent/10 px-3 py-2 text-sm">{error}</p>}
      </form>
    </Modal>
  );
}

function Teams() {
  const toast = useToast();
  const teams = useAsync<Department[]>(() => api.get("/api/departments"));
  const usage = useAsync<Record<string, number>>(() => api.get("/api/departments/usage"));
  const [editing, setEditing] = useState<Department | "new" | null>(null);
  const reload = () => { teams.reload(); usage.reload(); };

  async function remove(d: Department) {
    if (!window.confirm(`Delete the ${d.name} team?`)) return;
    try { await api.delete(`/api/departments/${d.id}`); toast.success("Team deleted"); reload(); } catch (e) { toast.error((e as Error).message); }
  }
  return (
    <section className="mt-12">
      <SectionTitle aside={<Button variant="primary" onClick={() => setEditing("new")}><Plus className="size-4" aria-hidden /> Add team</Button>}>Teams</SectionTitle>
      {teams.error ? <ErrorNote message={teams.error} onRetry={teams.reload} /> : !teams.data ? <Loading /> : teams.data.length === 0 ? <Empty title="No teams yet" body="Add one to group people for reports." /> : (
        <ul>
          {teams.data.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 border-t border-line py-3 first:border-t-0">
              <div className="min-w-0">
                <p className="font-medium">{d.name}</p>
                <p className="truncate text-sm text-muted">{people(usage.data?.[String(d.id)] ?? 0)}{d.description ? ` · ${d.description}` : ""}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button className="h-8" onClick={() => setEditing(d)}><Pencil className="size-3.5" aria-hidden /> Edit</Button>
                <Button variant="ghost" className="h-8" aria-label={`Delete ${d.name}`} onClick={() => remove(d)}><Trash2 className="size-3.5" aria-hidden /></Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing && <TeamModal key={editing === "new" ? "new" : editing.id} team={editing} onClose={() => setEditing(null)} onSaved={reload} />}
    </section>
  );
}

export default function Organisation() {
  return (
    <>
      <PageHeader title="Shifts and teams" subtitle="Working hours decide who is late and who worked overtime. Teams group people in reports." />
      <Shifts />
      <Teams />
    </>
  );
}
