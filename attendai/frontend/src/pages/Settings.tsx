import { useState } from "react";
import { Link } from "react-router-dom";
import { Mail, MonitorSmartphone, ScanFace, Send, Trash2 } from "lucide-react";
import { useToast } from "../components/Toast";
import { Badge, btn, Button, Empty, ErrorNote, Loading, PageHeader, Panel } from "../components/ui";
import { useAsync } from "../hooks/useAsync";
import { api } from "../lib/api";
import { fmtDate } from "../lib/format";
import type { EmailStatus, FaceEnrolled } from "../lib/types";

const MODE = {
  smtp: { tone: "present", label: "Sending real email", body: "Messages go out through your mail server." },
  console: { tone: "late", label: "Test mode", body: "No mail server is set, so emails are printed in the backend window instead of being sent. Set SMTP_HOST in backend/.env to send real email." },
  off: { tone: "idle", label: "Switched off", body: "EMAIL_ENABLED is false. In-app notifications still work." },
} as const;

function EmailPanel() {
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => api.get<EmailStatus>("/api/notifications/email-status"));
  const [busy, setBusy] = useState(false);

  async function test() {
    setBusy(true);
    try {
      const r = await api.post<{ mode: string; sent_to: string }>("/api/notifications/test-email");
      toast.success(r.mode === "console" ? "Test email printed in the backend window" : `Test email sent to ${r.sent_to}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel className="p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="rounded-lg bg-sunken p-2"><Mail className="size-5" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-lg font-semibold">Email notifications</h3>
          <p className="text-sm text-muted">Leave requests, decisions, new accounts and Face ID changes.</p>
        </div>
      </div>
      {loading && !data ? <Loading /> : error || !data ? <div className="mt-4"><ErrorNote message={error ?? "Could not load"} onRetry={reload} /></div> : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Badge tone={MODE[data.mode].tone}>{MODE[data.mode].label}</Badge>
            {data.host && <span className="text-sm text-muted">{data.host}</span>}
          </div>
          <p className="mt-2 text-sm text-muted">{MODE[data.mode].body}</p>
          {data.mode !== "off" && <p className="mt-1 text-sm text-muted">Sent from <span className="font-medium text-ink">{data.from_address}</span></p>}
          {data.mode !== "off" && <Button className="mt-4" loading={busy} onClick={test}><Send className="size-4" aria-hidden /> Send me a test email</Button>}
        </>
      )}
    </Panel>
  );
}

function FacePanel() {
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => api.get<FaceEnrolled[]>("/api/face/enrolled"));
  const [removing, setRemoving] = useState<number | null>(null);

  async function reset(p: FaceEnrolled) {
    if (!confirm(`Remove Face ID for ${p.full_name}? They will be told and can set it up again.`)) return;
    setRemoving(p.employee_id);
    try {
      await api.delete(`/api/face/${p.employee_id}`);
      toast.success(`Removed Face ID for ${p.full_name}`);
      reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRemoving(null);
    }
  }

  return (
    <Panel className="p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="rounded-lg bg-sunken p-2"><ScanFace className="size-5" aria-hidden /></span>
        <div className="flex-1">
          <h3 className="font-display text-lg font-semibold">Face ID</h3>
          <p className="text-sm text-muted">Who has set it up. Only numbers are stored, never photos, and HR cannot see them. Remove someone if they leave or ask you to.</p>
        </div>
      </div>
      <div className="mt-4">
        {loading && !data ? <Loading /> : error ? <ErrorNote message={error} onRetry={reload} /> : !data?.length ? (
          <Empty title="Nobody yet" body="People set it up themselves from the Face ID page." />
        ) : (
          <ul className="divide-y divide-line">
            {data.map((p) => (
              <li key={p.employee_id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.full_name}</p>
                  <p className="text-xs text-muted">{p.employee_code} · since {fmtDate(p.enrolled_at.slice(0, 10), { day: "numeric", month: "short", year: "numeric" })}</p>
                </div>
                <Button variant="ghost" className="h-8 px-2" loading={removing === p.employee_id} onClick={() => reset(p)} aria-label={`Remove Face ID for ${p.full_name}`}>
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}

export default function Settings() {
  return (
    <div>
      <PageHeader title="Check-in setup" subtitle="QR kiosk, Face ID and email for your workplace."
        actions={<Link to="/organisation" className={btn("secondary")}>Shifts and teams</Link>} />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Panel className="p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-sunken p-2"><MonitorSmartphone className="size-5" aria-hidden /></span>
              <div className="flex-1">
                <h3 className="font-display text-lg font-semibold">QR check-in screen</h3>
                <p className="text-sm text-muted">Open this on a tablet or monitor at the entrance. The code changes every 45 seconds, so a photo of it stops working quickly. People scan it from their phone to check in, and again to check out.</p>
              </div>
            </div>
            <Link to="/kiosk" className={btn("primary", "mt-4")}>Open the kiosk screen</Link>
          </Panel>
          <EmailPanel />
        </div>
        <FacePanel />
      </div>
    </div>
  );
}
