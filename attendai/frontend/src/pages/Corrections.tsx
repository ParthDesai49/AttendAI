import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useToast } from "../components/Toast";
import { Avatar, Badge, Button, Empty, ErrorNote, Field, Input, Loading, Modal, PageHeader, SectionTitle, Tabs, Textarea } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useAsync } from "../hooks/useAsync";
import { api } from "../lib/api";
import { fmtDate, fmtTime, isoDate, type Tone } from "../lib/format";
import type { Correction, PendingCorrection, RequestStatus } from "../lib/types";

const BADGE: Record<RequestStatus, { label: string; tone: Tone }> = {
  pending: { label: "Pending", tone: "late" },
  approved: { label: "Approved", tone: "present" },
  rejected: { label: "Rejected", tone: "absent" },
  cancelled: { label: "Cancelled", tone: "idle" },
};
const longDate = (s: string) => fmtDate(s, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const asked = (r: Correction) =>
  [r.requested_check_in && `in ${fmtTime(r.requested_check_in)}`, r.requested_check_out && `out ${fmtTime(r.requested_check_out)}`].filter(Boolean).join(", ");

function AskModal({ open, onClose, onSent }: { open: boolean; onClose: () => void; onSent: () => void }) {
  const toast = useToast();
  const today = isoDate(new Date());
  const earliest = isoDate(new Date(Date.now() - 31 * 86_400_000));
  const [day, setDay] = useState(isoDate(new Date(Date.now() - 86_400_000)));
  const [cin, setCin] = useState("");
  const [cout, setCout] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.post("/api/corrections", { work_date: day, check_in: cin || null, check_out: cout || null, reason: reason.trim() });
      toast.success("Correction sent for approval");
      setCin(""); setCout(""); setReason("");
      onSent();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Correct a day" footer={
      <>
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" form="ask-form" variant="primary" loading={busy} disabled={!cin && !cout}>Send request</Button>
      </>
    }>
      <form id="ask-form" onSubmit={submit} className="space-y-4">
        <Field label="Which day?" hint="Up to 31 days back.">
          <Input type="date" required min={earliest} max={today} value={day} onChange={(e) => setDay(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Check-in time"><Input type="time" value={cin} onChange={(e) => setCin(e.target.value)} /></Field>
          <Field label="Check-out time"><Input type="time" value={cout} onChange={(e) => setCout(e.target.value)} /></Field>
        </div>
        <p className="-mt-2 text-xs text-muted">Fill in only what was missed or wrong. On a night shift, a check-out earlier than the check-in means the next morning.</p>
        <Field label="What happened?" hint="Your approver will read this.">
          <Textarea required minLength={5} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: forgot to check out, left at 6:45 pm" />
        </Field>
        {error && <p role="alert" className="rounded-lg border border-absent/40 bg-absent/10 px-3 py-2 text-sm">{error}</p>}
      </form>
    </Modal>
  );
}

function Mine() {
  const toast = useToast();
  const list = useAsync<Correction[]>(() => api.get("/api/corrections/me"));
  const [open, setOpen] = useState(false);

  async function cancel(id: number) {
    try {
      await api.post(`/api/corrections/${id}/cancel`);
      toast.success("Request cancelled");
      list.reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <>
      <SectionTitle aside={<Button variant="primary" onClick={() => setOpen(true)}><Plus className="size-4" aria-hidden /> New request</Button>}>
        Your requests
      </SectionTitle>
      {list.error ? <ErrorNote message={list.error} onRetry={list.reload} /> : !list.data ? <Loading /> : list.data.length === 0 ? (
        <Empty title="No corrections yet" body="Forgot to check out, or the camera was down? Ask for the day to be fixed and your manager will approve it." />
      ) : (
        <ul>
          {list.data.map((r) => (
            <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 border-t border-line py-4 first:border-t-0">
              <div>
                <p className="font-medium">{longDate(r.work_date)}</p>
                <p className="text-sm text-muted">{asked(r)}</p>
                <p className="mt-1 text-sm">{r.reason}</p>
              </div>
              <div className="flex items-center gap-3">
                <Badge tone={BADGE[r.status].tone}>{BADGE[r.status].label}</Badge>
                {r.status === "pending" && <Button className="h-8" onClick={() => cancel(r.id)}>Cancel request</Button>}
              </div>
            </li>
          ))}
        </ul>
      )}
      <AskModal open={open} onClose={() => setOpen(false)} onSent={list.reload} />
    </>
  );
}

function Approvals({ onChanged }: { onChanged: () => void }) {
  const toast = useToast();
  const list = useAsync<PendingCorrection[]>(() => api.get("/api/corrections/pending"));
  const [target, setTarget] = useState<{ req: PendingCorrection; approve: boolean } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function decide(e: FormEvent) {
    e.preventDefault();
    if (!target) return;
    setBusy(true);
    try {
      await api.post(`/api/corrections/${target.req.id}/review`, { approve: target.approve, note: note.trim() || null });
      toast.success(target.approve ? "Correction approved" : "Correction rejected");
      setTarget(null); setNote("");
      list.reload(); onChanged();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (list.error) return <ErrorNote message={list.error} onRetry={list.reload} />;
  if (!list.data) return <Loading />;
  if (list.data.length === 0) return <Empty title="Nothing to review" body="Correction requests from your team will appear here." />;
  return (
    <>
      <ul>
        {list.data.map((r) => (
          <li key={r.id} className="flex flex-wrap items-start justify-between gap-4 border-t border-line py-4 first:border-t-0">
            <div className="flex gap-3">
              <Avatar name={r.employee_name} />
              <div>
                <p className="font-medium">{r.employee_name} <span className="font-normal text-muted">· {longDate(r.work_date)}</span></p>
                <p className="text-sm text-muted">
                  Now: {r.current_check_in ? `in ${fmtTime(r.current_check_in)}` : "no check-in"}, {r.current_check_out ? `out ${fmtTime(r.current_check_out)}` : "no check-out"}
                </p>
                <p className="text-sm">Asks for: <span className="font-medium">{asked(r)}</span></p>
                <p className="mt-1 text-sm text-muted">{r.reason}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setTarget({ req: r, approve: false })}>Reject</Button>
              <Button variant="primary" onClick={() => setTarget({ req: r, approve: true })}>Approve</Button>
            </div>
          </li>
        ))}
      </ul>
      <Modal open={!!target} onClose={() => setTarget(null)} title={target ? `${target.approve ? "Approve" : "Reject"} ${target.req.employee_name}'s correction` : ""} footer={
        <>
          <Button onClick={() => setTarget(null)}>Cancel</Button>
          <Button type="submit" form="decide-form" variant={target?.approve ? "primary" : "danger"} loading={busy}>{target?.approve ? "Approve" : "Reject"}</Button>
        </>
      }>
        <form id="decide-form" onSubmit={decide} className="space-y-4">
          {target?.approve && <p className="text-sm text-muted">This rewrites the day's attendance. Late, worked time and overtime are worked out again.</p>}
          <Field label="Note for the employee" hint="Optional."><Textarea maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </form>
      </Modal>
    </>
  );
}

export default function Corrections() {
  const { isApprover } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab: "mine" | "approvals" = params.get("tab") === "approvals" && isApprover ? "approvals" : "mine";
  const pending = useAsync<PendingCorrection[]>(() => (isApprover ? api.get<PendingCorrection[]>("/api/corrections/pending") : Promise.resolve([])), [isApprover]);
  return (
    <>
      <PageHeader title="Corrections" subtitle="Fix a missed check-in or check-out. Your manager approves it and the day is recalculated." />
      <Tabs value={tab} onChange={(t) => setParams(t === "mine" ? {} : { tab: t })}
        items={[{ id: "mine", label: "My requests" }, ...(isApprover ? [{ id: "approvals" as const, label: "Approvals", badge: pending.data?.length }] : [])]} />
      {tab === "approvals" ? <Approvals onChanged={pending.reload} /> : <Mine />}
    </>
  );
}
