import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { KeyRound, ScanFace } from "lucide-react";
import { useToast } from "../components/Toast";
import { btn, Button, Field, Input, PageHeader, Panel, SectionTitle } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { fmtDate, fmtShift, MODE_LABEL, ROLE_LABEL } from "../lib/format";

function ChangePassword() {
  const toast = useToast();
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (next !== again) return setError("The two new passwords are not the same.");
    setBusy(true);
    try {
      await api.post("/api/auth/change-password", { current_password: cur, new_password: next });
      toast.success("Password changed");
      setCur(""); setNext(""); setAgain("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel className="p-5">
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold"><KeyRound className="size-5" aria-hidden /> Change password</h2>
      <form onSubmit={submit} className="mt-4 max-w-sm space-y-4">
        <Field label="Current password"><Input type="password" required autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} /></Field>
        <Field label="New password" hint="At least 8 characters."><Input type="password" required minLength={8} maxLength={72} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></Field>
        <Field label="New password again"><Input type="password" required minLength={8} maxLength={72} autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} /></Field>
        {error && <p role="alert" className="rounded-lg border border-absent/40 bg-absent/10 px-3 py-2 text-sm">{error}</p>}
        <Button type="submit" variant="primary" loading={busy}>Change password</Button>
      </form>
    </Panel>
  );
}

export default function Profile() {
  const { user } = useAuth();
  if (!user) return null;
  const rows: [string, string][] = [
    ["Employee ID", user.employee_code], ["Email", user.email], ["Role", ROLE_LABEL[user.role]],
    ["Team", user.department?.name ?? "–"], ["Works from", MODE_LABEL[user.work_mode]],
    ["Shift", user.shift ? `${user.shift.name}, ${fmtShift(user.shift.start_time)} – ${fmtShift(user.shift.end_time)}` : "–"],
    ["Joined", fmtDate(user.date_of_joining, { day: "numeric", month: "short", year: "numeric" })],
  ];
  return (
    <>
      <PageHeader title={user.full_name} subtitle={user.designation ?? ROLE_LABEL[user.role]} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel className="p-5">
          <SectionTitle>Your details</SectionTitle>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            {rows.map(([k, v]) => (<div key={k} className="contents"><dt className="text-muted">{k}</dt><dd className="font-medium">{v}</dd></div>))}
          </dl>
          <p className="mt-4 text-xs text-muted">To change these, ask HR.</p>
          <Link to="/face" className={btn("secondary", "mt-4")}><ScanFace className="size-4" aria-hidden /> Face ID settings</Link>
        </Panel>
        <ChangePassword />
      </div>
    </>
  );
}
