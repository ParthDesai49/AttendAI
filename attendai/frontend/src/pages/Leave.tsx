import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useToast } from "../components/Toast";
import { HolidaysPanel } from "./Holidays";
import { Avatar, Badge, Button, Empty, ErrorNote, Field, Input, Loading, Modal, PageHeader, SectionTitle, Select, Tabs, Textarea } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useAsync } from "../hooks/useAsync";
import { api } from "../lib/api";
import { fmtRange, isoDate, type Tone } from "../lib/format";
import type { LeaveBalance, LeaveRequest, LeaveType, PendingLeave, RequestStatus } from "../lib/types";

const REQUEST_BADGE: Record<RequestStatus, { label: string; tone: Tone }> = {
  pending: { label: "Pending", tone: "late" },
  approved: { label: "Approved", tone: "present" },
  rejected: { label: "Rejected", tone: "absent" },
  cancelled: { label: "Cancelled", tone: "idle" },
};
const RequestBadge = ({ status }: { status: RequestStatus }) => <Badge tone={REQUEST_BADGE[status].tone}>{REQUEST_BADGE[status].label}</Badge>;
const dayWord = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

function ApplyModal({ open, types, onClose, onSent }: { open: boolean; types: LeaveType[]; onClose: () => void; onSent: () => void }) {
  const toast = useToast();
  const today = isoDate(new Date());
  const [typeId, setTypeId] = useState("");
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [half, setHalf] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.post("/api/leave", {
        leave_type_id: Number(typeId || types[0]?.id), start_date: start, end_date: half ? start : end,
        is_half_day: half, reason: reason.trim() || null,
      });
      toast.success("Leave request sent");
      setReason("");
      onSent();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Apply for leave" footer={
      <>
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" form="apply-form" variant="primary" loading={busy}>Send request</Button>
      </>
    }>
      <form id="apply-form" onSubmit={submit} className="space-y-4">
        <Field label="Leave type">
          <Select value={typeId || String(types[0]?.id ?? "")} onChange={(e) => setTypeId(e.target.value)}>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}{t.is_paid ? "" : " (unpaid)"}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From">
            <Input type="date" required min={today} value={start} onChange={(e) => { setStart(e.target.value); if (end < e.target.value) setEnd(e.target.value); }} />
          </Field>
          <Field label="To">
            <Input type="date" required min={start} value={half ? start : end} disabled={half} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={half} onChange={(e) => setHalf(e.target.checked)} className="size-4 accent-[var(--hero)]" />
          Half day only
        </label>
        <Field label="Reason" hint="Optional. Your approver will see this.">
          <Textarea maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {error && <p role="alert" className="rounded-lg border border-absent/40 bg-absent/10 px-3 py-2 text-sm">{error}</p>}
      </form>
    </Modal>
  );
}

function MyLeave({ onChanged }: { onChanged: () => void }) {
  const toast = useToast();
  const balances = useAsync<LeaveBalance[]>(() => api.get("/api/leave/balances"));
  const requests = useAsync<LeaveRequest[]>(() => api.get("/api/leave/me"));
  const types = useAsync<LeaveType[]>(() => api.get("/api/leave/types"));
  const [open, setOpen] = useState(false);
  const typeName = (id: number) => types.data?.find((t) => t.id === id)?.name ?? "Leave";

  async function cancel(id: number) {
    try {
      await api.post(`/api/leave/${id}/cancel`);
      toast.success("Request cancelled");
      requests.reload();
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <>
      <section>
        <SectionTitle aside={<Button variant="primary" onClick={() => setOpen(true)}><Plus className="size-4" aria-hidden /> Apply for leave</Button>}>
          Your balance this year
        </SectionTitle>
        {balances.error ? <ErrorNote message={balances.error} onRetry={balances.reload} /> : balances.data ? (
          <ul className="grid gap-6 sm:grid-cols-3">
            {balances.data.map((b) => (
              <li key={b.code} className="border-l-2 border-line pl-4">
                <p className="text-sm text-muted">{b.type}</p>
                <p className="font-display text-3xl font-bold tracking-tight">
                  {b.remaining}<span className="ml-1.5 text-base font-medium text-muted">of {b.allocated} days left</span>
                </p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken">
                  <div className="h-full rounded-full bg-leave" style={{ width: `${b.allocated ? (b.remaining / b.allocated) * 100 : 0}%` }} />
                </div>
              </li>
            ))}
          </ul>
        ) : <Loading />}
      </section>

      <section className="mt-12">
        <SectionTitle>Your requests</SectionTitle>
        {requests.error ? <ErrorNote message={requests.error} onRetry={requests.reload} /> : !requests.data ? <Loading /> : requests.data.length === 0 ? (
          <Empty title="No leave requests yet" body="When you apply for time off, it will show up here." />
        ) : (
          <ul>
            {requests.data.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 border-t border-line py-4 first:border-t-0">
                <div>
                  <p className="font-medium">{typeName(r.leave_type_id)}, {dayWord(r.days)}</p>
                  <p className="text-sm text-muted">{fmtRange(r.start_date, r.end_date)}{r.is_half_day ? " (half day)" : ""}</p>
                  {r.reason && <p className="mt-1 text-sm">{r.reason}</p>}
                  {r.review_note && <p className="mt-1 text-sm text-muted">Reviewer note: {r.review_note}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <RequestBadge status={r.status} />
                  {r.status === "pending" && <Button className="h-8" onClick={() => cancel(r.id)}>Cancel request</Button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ApplyModal open={open} types={types.data ?? []} onClose={() => setOpen(false)}
        onSent={() => { requests.reload(); balances.reload(); onChanged(); }} />
    </>
  );
}

function ReviewModal({ target, onClose, onDone }: {
  target: { req: PendingLeave; approve: boolean } | null; onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  if (!target) return null;
  const { req, approve } = target;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/api/leave/${req.id}/review`, { approve, note: note.trim() || null });
      toast.success(approve ? "Request approved" : "Request rejected");
      setNote("");
      onDone();
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`${approve ? "Approve" : "Reject"} ${req.employee_name}'s request`} footer={
      <>
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" form="review-form" variant={approve ? "primary" : "danger"} loading={busy}>
          {approve ? "Approve request" : "Reject request"}
        </Button>
      </>
    }>
      <form id="review-form" onSubmit={submit} className="space-y-4">
        <p className="text-sm text-muted">{req.leave_type}, {dayWord(req.days)}, {fmtRange(req.start_date, req.end_date)}</p>
        <Field label="Note for the employee" hint="Optional.">
          <Textarea maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}

function Approvals({ items, loading, error, reload }: { items: PendingLeave[]; loading: boolean; error?: string; reload: () => void }) {
  const [target, setTarget] = useState<{ req: PendingLeave; approve: boolean } | null>(null);
  if (error) return <ErrorNote message={error} onRetry={reload} />;
  if (loading && items.length === 0) return <Loading />;
  if (items.length === 0) return <Empty title="Nothing to review" body="New leave requests from your team will appear here." />;
  return (
    <>
      <ul>
        {items.map((r) => (
          <li key={r.id} className="flex flex-wrap items-start justify-between gap-4 border-t border-line py-4 first:border-t-0">
            <div className="flex gap-3">
              <Avatar name={r.employee_name} />
              <div>
                <p className="font-medium">{r.employee_name}</p>
                <p className="text-sm text-muted">{r.leave_type}, {dayWord(r.days)}, {fmtRange(r.start_date, r.end_date)}</p>
                {r.reason && <p className="mt-1 text-sm">{r.reason}</p>}
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setTarget({ req: r, approve: false })}>Reject</Button>
              <Button variant="primary" onClick={() => setTarget({ req: r, approve: true })}>Approve</Button>
            </div>
          </li>
        ))}
      </ul>
      <ReviewModal key={target?.req.id} target={target} onClose={() => setTarget(null)} onDone={reload} />
    </>
  );
}

export default function Leave() {
  const { isApprover } = useAuth();
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  const tab: "mine" | "holidays" | "approvals" = raw === "holidays" ? "holidays" : raw === "approvals" && isApprover ? "approvals" : "mine";
  const pending = useAsync<PendingLeave[]>(() => (isApprover ? api.get<PendingLeave[]>("/api/leave/pending") : Promise.resolve([])), [isApprover]);

  return (
    <>
      <PageHeader title="Leave" subtitle="Apply for time off, see company holidays, and track what has been decided." />
      <Tabs value={tab} onChange={(t) => setParams(t === "mine" ? {} : { tab: t })}
        items={[
          { id: "mine", label: "My leave" },
          { id: "holidays", label: "Holidays" },
          ...(isApprover ? [{ id: "approvals" as const, label: "Approvals", badge: pending.data?.length }] : []),
        ]} />
      {tab === "approvals"
        ? <Approvals items={pending.data ?? []} loading={pending.loading} error={pending.error} reload={pending.reload} />
        : tab === "holidays" ? <HolidaysPanel />
        : <MyLeave onChanged={pending.reload} />}
    </>
  );
}
