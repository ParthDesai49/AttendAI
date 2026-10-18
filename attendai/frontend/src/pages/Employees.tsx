import { useState, type FormEvent } from "react";
import { Plus, Search, Upload } from "lucide-react";
import { Link } from "react-router-dom";
import { ImportPeople } from "../components/ImportPeople";
import { useToast } from "../components/Toast";
import { Avatar, Badge, btn, Button, Empty, ErrorNote, Field, Input, Loading, Modal, PageHeader, Select } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useAsync } from "../hooks/useAsync";
import { api } from "../lib/api";
import { isoDate, MODE_LABEL, ROLE_LABEL, type Tone } from "../lib/format";
import type { Department, Employee, EmpStatus, Role, Shift, WorkMode } from "../lib/types";

const STATUS_BADGE: Record<EmpStatus, { label: string; tone: Tone }> = {
  active: { label: "Active", tone: "present" },
  on_notice: { label: "On notice", tone: "late" },
  inactive: { label: "Inactive", tone: "idle" },
};

interface FormState {
  full_name: string; employee_code: string; email: string; phone: string; designation: string;
  department_id: string; manager_id: string; shift_id: string; role: Role; work_mode: WorkMode;
  date_of_joining: string; password: string; status: EmpStatus;
}
const toForm = (e?: Employee): FormState => ({
  full_name: e?.full_name ?? "", employee_code: e?.employee_code ?? "", email: e?.email ?? "", phone: e?.phone ?? "",
  designation: e?.designation ?? "", department_id: String(e?.department?.id ?? ""), manager_id: String(e?.manager_id ?? ""),
  shift_id: String(e?.shift?.id ?? ""), role: e?.role ?? "employee", work_mode: e?.work_mode ?? "office",
  date_of_joining: e?.date_of_joining ?? isoDate(new Date()), password: "", status: e?.status ?? "active",
});
const num = (v: string) => (v ? Number(v) : null);

function ResetPassword({ id, name }: { id: number; name: string }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  async function reset() {
    setBusy(true);
    try {
      await api.post(`/api/employees/${id}/reset-password`, { new_password: pw });
      toast.success(`Password reset. Tell ${name.split(" ")[0]} the new one.`);
      setPw(""); setOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-5 border-t border-line pt-4">
      {!open ? <Button variant="ghost" onClick={() => setOpen(true)}>Reset password…</Button> : (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1"><Field label="New password" hint="At least 8 characters. Share it with them in person."><Input type="text" minLength={8} maxLength={72} autoComplete="off" value={pw} onChange={(e) => setPw(e.target.value)} /></Field></div>
          <Button variant="primary" disabled={pw.length < 8} loading={busy} onClick={reset}>Set password</Button>
        </div>
      )}
    </div>
  );
}

function PersonModal({ person, people, departments, shifts, onClose, onSaved }: {
  person: Employee | null; people: Employee[]; departments: Department[]; shifts: Shift[]; onClose: () => void; onSaved: () => void;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const [f, setF] = useState<FormState>(() => toForm(person ?? undefined));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setF((s) => ({ ...s, [key]: value }));
  const roles: Role[] = user?.role === "admin" ? ["admin", "hr", "manager", "employee"] : ["hr", "manager", "employee"];
  const managers = people.filter((p) => p.role !== "employee" && p.id !== person?.id);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (person) {
        const all = {
          full_name: f.full_name, phone: f.phone || null, designation: f.designation || null, role: f.role, work_mode: f.work_mode,
          status: f.status, department_id: num(f.department_id), manager_id: num(f.manager_id), shift_id: num(f.shift_id),
        };
        const before = toForm(person);
        const changes = Object.fromEntries(Object.entries(all).filter(([k]) => {
          const key = k as keyof FormState;
          return String(f[key]) !== String(before[key]);
        }));
        await api.patch(`/api/employees/${person.id}`, changes);
        toast.success("Changes saved");
      } else {
        await api.post("/api/employees", {
          employee_code: f.employee_code, full_name: f.full_name, email: f.email, password: f.password, phone: f.phone || null,
          role: f.role, department_id: num(f.department_id), manager_id: num(f.manager_id), shift_id: num(f.shift_id),
          designation: f.designation || null, work_mode: f.work_mode, date_of_joining: f.date_of_joining,
        });
        toast.success("Person added");
      }
      onSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={person ? "Edit person" : "Add person"} footer={
      <>
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" form="person-form" variant="primary" loading={busy}>{person ? "Save changes" : "Add person"}</Button>
      </>
    }>
      <form id="person-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><Field label="Full name"><Input required value={f.full_name} onChange={(e) => set("full_name", e.target.value)} /></Field></div>
        <Field label="Employee ID"><Input required disabled={!!person} maxLength={20} value={f.employee_code} onChange={(e) => set("employee_code", e.target.value)} /></Field>
        <Field label="Phone"><Input type="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
        <div className="sm:col-span-2"><Field label="Work email"><Input type="email" required disabled={!!person} value={f.email} onChange={(e) => set("email", e.target.value)} /></Field></div>
        <Field label="Designation"><Input value={f.designation} onChange={(e) => set("designation", e.target.value)} /></Field>
        <Field label="Team">
          <Select value={f.department_id} onChange={(e) => set("department_id", e.target.value)}>
            <option value="">No team</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
        </Field>
        <Field label="Reports to">
          <Select value={f.manager_id} onChange={(e) => set("manager_id", e.target.value)}>
            <option value="">Nobody</option>
            {managers.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
          </Select>
        </Field>
        <Field label="Shift">
          <Select value={f.shift_id} onChange={(e) => set("shift_id", e.target.value)}>
            <option value="">Default shift</option>
            {shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Role">
          <Select value={f.role} onChange={(e) => set("role", e.target.value as Role)}>
            {(roles.includes(f.role) ? roles : [f.role, ...roles]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </Select>
        </Field>
        <Field label="Works from">
          <Select value={f.work_mode} onChange={(e) => set("work_mode", e.target.value as WorkMode)}>
            {(Object.keys(MODE_LABEL) as WorkMode[]).map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
          </Select>
        </Field>
        {person ? (
          <Field label="Status">
            <Select value={f.status} onChange={(e) => set("status", e.target.value as EmpStatus)}>
              {(Object.keys(STATUS_BADGE) as EmpStatus[]).map((s) => <option key={s} value={s}>{STATUS_BADGE[s].label}</option>)}
            </Select>
          </Field>
        ) : (
          <>
            <Field label="Joining date"><Input type="date" required value={f.date_of_joining} onChange={(e) => set("date_of_joining", e.target.value)} /></Field>
            <div className="sm:col-span-2">
              <Field label="First password" hint="At least 8 characters. They can use it to sign in right away.">
                <Input type="text" required minLength={8} maxLength={72} autoComplete="off" value={f.password} onChange={(e) => set("password", e.target.value)} />
              </Field>
            </div>
          </>
        )}
        {error && <p role="alert" className="rounded-lg border border-absent/40 bg-absent/10 px-3 py-2 text-sm sm:col-span-2">{error}</p>}
      </form>
      {person && <ResetPassword id={person.id} name={person.full_name} />}
    </Modal>
  );
}

export default function Employees() {
  const { isHR } = useAuth();
  const list = useAsync<Employee[]>(() => api.get("/api/employees"));
  const departments = useAsync<Department[]>(() => api.get("/api/departments"));
  const shifts = useAsync<Shift[]>(() => api.get("/api/shifts"));
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("");
  const [editing, setEditing] = useState<Employee | "new" | null>(null);
  const [importing, setImporting] = useState(false);

  const all = list.data ?? [];
  const shown = all.filter((p) =>
    (!dept || String(p.department?.id) === dept) &&
    `${p.full_name} ${p.employee_code} ${p.email}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <PageHeader
        title="People"
        subtitle={list.data ? `${all.length} ${all.length === 1 ? "person" : "people"} in your company.` : undefined}
        actions={isHR && (
          <div className="flex flex-wrap gap-2">
            <Link to="/organisation" className={btn("secondary")}>Shifts and teams</Link>
            <Button onClick={() => setImporting(true)}><Upload className="size-4" aria-hidden /> Import CSV</Button>
            <Button variant="primary" onClick={() => setEditing("new")}><Plus className="size-4" aria-hidden /> Add person</Button>
          </div>
        )}
      />
      <div className="mb-5 flex flex-wrap gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted" aria-hidden />
          <Input aria-label="Search people" placeholder="Search by name, ID or email" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select aria-label="Filter by team" className="w-full sm:w-52" value={dept} onChange={(e) => setDept(e.target.value)}>
          <option value="">All teams</option>
          {(departments.data ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </Select>
      </div>

      {list.error ? <ErrorNote message={list.error} onRetry={list.reload} /> : !list.data ? <Loading /> : shown.length === 0 ? (
        <Empty title="No one found" body="Try a different search or team." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="text-left text-muted">
              <tr>
                <th className="py-2 pr-4 font-medium">Person</th><th className="py-2 pr-4 font-medium">ID</th>
                <th className="hidden py-2 pr-4 font-medium md:table-cell">Team</th><th className="py-2 pr-4 font-medium">Role</th>
                <th className="hidden py-2 pr-4 font-medium lg:table-cell">Works from</th><th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.id} className="border-t border-line">
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-3">
                      <Avatar name={p.full_name} />
                      <div className="min-w-0">
                        {isHR
                          ? <button onClick={() => setEditing(p)} className="font-medium underline-offset-4 hover:underline">{p.full_name}</button>
                          : <p className="font-medium">{p.full_name}</p>}
                        <p className="truncate text-xs text-muted">{p.designation ?? p.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 pr-4 tabular-nums text-muted">{p.employee_code}</td>
                  <td className="hidden py-3 pr-4 text-muted md:table-cell">{p.department?.name ?? "–"}</td>
                  <td className="py-3 pr-4">{ROLE_LABEL[p.role]}</td>
                  <td className="hidden py-3 pr-4 text-muted lg:table-cell">{MODE_LABEL[p.work_mode]}</td>
                  <td className="py-3"><Badge tone={STATUS_BADGE[p.status].tone}>{STATUS_BADGE[p.status].label}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {importing && <ImportPeople onClose={() => setImporting(false)} onDone={list.reload} />}
      {editing && (
        <PersonModal key={editing === "new" ? "new" : editing.id} person={editing === "new" ? null : editing}
          people={all} departments={departments.data ?? []} shifts={shifts.data ?? []}
          onClose={() => setEditing(null)} onSaved={list.reload} />
      )}
    </>
  );
}
