import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import jsQR from "jsqr";
import { CircleCheck, QrCode, TriangleAlert } from "lucide-react";
import { useToast } from "../components/Toast";
import { btn, Button, ErrorNote, PageHeader, Panel } from "../components/ui";
import { useCamera } from "../hooks/useCamera";
import { api } from "../lib/api";
import { fmtMinutes, fmtTime } from "../lib/format";
import type { PunchResult } from "../lib/types";

/** The kiosk QR holds a link like https://app/scan?t=TOKEN. A bare token works too. */
export function tokenFromScan(text: string): string | null {
  const raw = text.trim();
  try {
    const t = new URL(raw).searchParams.get("t");
    if (t) return t;
  } catch { /* not a link */ }
  return /^\d+\.\d+\.[0-9a-f]{16,}$/i.test(raw) ? raw : null;
}

function Result({ r }: { r: PunchResult }) {
  const a = r.attendance;
  const out = r.action === "check_out";
  return (
    <Panel className="p-8 text-center">
      <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-present/15 text-present"><CircleCheck className="size-9" aria-hidden /></span>
      <h2 className="mt-4 font-display text-2xl font-bold">{out ? "Checked out" : "Checked in"} at {fmtTime(out ? a.check_out : a.check_in)}</h2>
      <p className="mt-1 text-muted">
        {out ? `You worked ${fmtMinutes(a.worked_minutes)} today.` : a.late_minutes ? `You were ${fmtMinutes(a.late_minutes)} late.` : "You're on time."}
      </p>
      <Link to="/" className={btn("primary", "mt-6 px-6")}>Back to dashboard</Link>
    </Panel>
  );
}

function Scanner({ onToken }: { onToken: (t: string) => void }) {
  const { videoRef, state, error } = useCamera("environment");
  const [wrong, setWrong] = useState(false);
  const found = useRef(false);

  useEffect(() => {
    if (state !== "ready") return;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    let stop = false;
    let timer = 0;
    const tick = () => {
      const v = videoRef.current;
      if (stop || !v || !ctx) return;
      if (v.videoWidth) {
        const w = Math.min(640, v.videoWidth);
        canvas.width = w;
        canvas.height = Math.round((w * v.videoHeight) / v.videoWidth);
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
        if (code?.data && !found.current) {
          const t = tokenFromScan(code.data);
          if (t) { found.current = true; onToken(t); return; }
          setWrong(true);
        }
      }
      timer = window.setTimeout(tick, 150);
    };
    tick();
    return () => { stop = true; clearTimeout(timer); };
  }, [state, videoRef, onToken]);

  return (
    <div>
      <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-3xl bg-hero">
        <video ref={videoRef} playsInline muted className="size-full object-cover" aria-label="Camera view" />
        {state === "ready" && (
          <div className="pointer-events-none absolute inset-[14%] rounded-2xl border-4 border-mark/90 shadow-[0_0_0_999px_rgba(0,0,0,0.35)]" aria-hidden />
        )}
        {state === "starting" && <p className="absolute inset-0 grid place-items-center text-sm text-hero-muted">Starting camera…</p>}
      </div>
      {state === "error" && <div className="mt-4"><ErrorNote message={error} /></div>}
      {state === "ready" && (
        <p className="mt-4 text-center text-sm text-muted" role="status">
          {wrong ? <span className="inline-flex items-center gap-1.5 text-late"><TriangleAlert className="size-4" aria-hidden /> That isn't an AttendAI code. Scan the one on the office screen.</span>
            : "Point the camera at the code on the office screen."}
        </p>
      )}
    </div>
  );
}

export default function Scan() {
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const [token, setToken] = useState<string | null>(params.get("t"));
  const [result, setResult] = useState<PunchResult | null>(null);
  const [error, setError] = useState("");
  const sent = useRef<string | null>(null);

  useEffect(() => {
    if (!token || sent.current === token) return;
    sent.current = token;
    if (params.has("t")) { params.delete("t"); setParams(params, { replace: true }); } // keep the token out of the address bar and history
    setError("");
    api.post<PunchResult>("/api/attendance/qr-punch", { token })
      .then((r) => { setResult(r); toast.success(r.action === "check_out" ? "Checked out" : "Checked in"); })
      .catch((e: Error) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function again() {
    sent.current = null;
    setToken(null);
    setError("");
  }

  return (
    <div className="mx-auto max-w-md">
      <PageHeader title="Scan to check in" subtitle="Scan the code on the office screen. Scan again later to check out." />
      {result ? <Result r={result} />
        : token && !error ? <Panel className="p-10 text-center text-muted">Checking you in…</Panel>
        : error ? (
          <div className="space-y-4">
            <ErrorNote message={error} />
            <Button variant="primary" onClick={again}><QrCode className="size-4" aria-hidden /> Scan again</Button>
          </div>
        ) : <Scanner onToken={setToken} />}
    </div>
  );
}
