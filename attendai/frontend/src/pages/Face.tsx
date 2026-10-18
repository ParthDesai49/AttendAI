import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { CircleCheck, ScanFace, ShieldCheck, Trash2 } from "lucide-react";
import { useToast } from "../components/Toast";
import { btn, Button, ErrorNote, Field, Input, Loading, PageHeader, Panel, SectionTitle } from "../components/ui";
import { useAsync } from "../hooks/useAsync";
import { useCamera } from "../hooks/useCamera";
import { api } from "../lib/api";
import { backendName, BlinkDetector, TurnDetector, describe, inspect, loadFace, type FaceFrame } from "../lib/face";
import { fmtMinutes, fmtTime } from "../lib/format";
import type { FaceStatus, PunchResult } from "../lib/types";

const canSkipShown = (start: number) => Date.now() - start > 8000; // offer the fallback after 8 seconds
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SAMPLES = [
  "Look straight at the camera",
  "Turn your head a little to the left",
  "Turn your head a little to the right",
];

type Mode = "verify" | "enroll";

/** Camera with an oval guide. Calls run(video, say) once the camera and models are ready, and stops the loop when removed. */
function FaceCamera({ run, onDone, onError, footer }: {
  run: (video: HTMLVideoElement, say: (m: string, ok?: boolean) => void, alive: () => boolean, info: (t: string) => void) => Promise<void>;
  onDone: () => void;
  onError: (m: string) => void;
  footer?: ReactNode;
}) {
  const { videoRef, state, error } = useCamera("user");
  const [msg, setMsg] = useState("Loading face models…");
  const [ok, setOk] = useState(false);
  const [info, setInfo] = useState("");
  const [models, setModels] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    let live = true;
    loadFace().then(() => live && setModels(true)).catch(() => live && onError("The face models could not be loaded. Check your connection and try again."));
    return () => { live = false; };
  }, [onError]);

  useEffect(() => {
    if (state !== "ready" || !models || started.current) return;
    started.current = true;
    let live = true;
    run(videoRef.current!, (m, good = false) => { setMsg(m); setOk(good); }, () => live, setInfo)
      .then(() => live && onDone())
      .catch((e: Error) => live && onError(e.message));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, models]);

  return (
    <div>
      <div className="relative mx-auto aspect-[3/4] w-full max-w-xs overflow-hidden rounded-3xl bg-hero sm:aspect-square sm:max-w-sm">
        <video ref={videoRef} playsInline muted className="size-full -scale-x-100 object-cover" aria-label="Camera view" />
        <div className={`pointer-events-none absolute left-1/2 top-1/2 h-[68%] w-[56%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-4 transition-colors ${ok ? "border-present" : "border-mark/90"}`} aria-hidden />
      </div>
      {state === "error" ? <div className="mt-4"><ErrorNote message={error} /></div>
        : <p role="status" className="mt-4 text-center font-medium">{state === "starting" ? "Starting camera…" : msg}</p>}
      {info && <p className="mt-1 text-center text-xs tabular-nums text-muted">{info}</p>}
      {footer}
    </div>
  );
}

function Verify({ status, onPunched }: { status: FaceStatus; onPunched: (r: PunchResult) => void }) {
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [canSkip, setCanSkip] = useState(false);
  const skip = useRef(false);

  async function run(video: HTMLVideoElement, say: (m: string, ok?: boolean) => void, alive: () => boolean, info: (t: string) => void) {
    const blink = new BlinkDetector();
    const turn = new TurnDetector();
    const start = Date.now();
    const deadline = start + 40_000;
    let frames = 0, tick = Date.now(), fps = 0;
    skip.current = false;
    setCanSkip(false);
    say("Look at the camera");
    while (alive()) {
      if (Date.now() > deadline) throw new Error("I didn't see you blink or turn your head. Face the light and try again: blink firmly, or turn your head slowly to one side and back.");
      setCanSkip(canSkipShown(start));
      let f: FaceFrame | null = null;
      try { f = await inspect(video); } catch { f = null; }
      frames += 1;
      if (Date.now() - tick >= 1000) { fps = frames; frames = 0; tick = Date.now(); }
      info(f
        ? `face found · size ${Math.round(f.size * 100)}% · eyes ${f.ear.toFixed(2)} · head ${f.yaw.toFixed(2)} · ${fps} checks/s · ${backendName || "?"}`
        : `no face found · ${fps} checks/s · ${backendName || "?"}`);
      if (skip.current) break;
      if (!f) say("I can't see a face. Move into the frame.");
      else if (!f.big) say("Move a little closer");
      else if (!blink.ready || !turn.ready) say("Hold still…", true);
      else say("Now blink, or turn your head slowly to one side and back", true);
      if (f?.big) {
        const blinked = blink.push(f.ear);
        const turned = turn.push(f.yaw);
        if (blinked || turned) break;
      }
      await wait(30);
    }
    if (!alive()) return;
    setCanSkip(false);
    say("Checking… keep looking at the camera", true);
    setBusy(true);
    await wait(skip.current ? 100 : 300); // let the eyes open and the head settle
    const descriptor = await describe(video);
    if (!descriptor) throw new Error("I lost sight of your face. Try again.");
    const result = await api.post<PunchResult>("/api/attendance/face-punch", { descriptor });
    onPunched(result);
  }

  if (error) {
    return (
      <div className="space-y-4">
        <ErrorNote message={error} />
        <Button variant="primary" onClick={() => { setError(""); setBusy(false); setAttempt((a) => a + 1); }}><ScanFace className="size-4" aria-hidden /> Try again</Button>
      </div>
    );
  }
  void status;
  return (
    <FaceCamera
      key={attempt} run={run} onDone={() => setBusy(false)} onError={(m) => { setBusy(false); setError(m); }}
      footer={canSkip && !busy && (
        <div className="mt-4 rounded-xl border border-line bg-sunken p-3 text-center text-sm">
          <p className="text-muted">Not picking up your movement? Your face can still be matched without it. This is less secure against a photo.</p>
          <Button className="mt-2" onClick={() => { skip.current = true; }}>Continue with face match only</Button>
        </div>
      )}
    />
  );
}

function Enroll({ onEnrolled }: { onEnrolled: () => void }) {
  const toast = useToast();
  const [consent, setConsent] = useState(false);
  const [password, setPassword] = useState("");
  const [started, setStarted] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState(0);

  async function run(video: HTMLVideoElement, say: (m: string, ok?: boolean) => void, alive: () => boolean) {
    const samples: number[][] = [];
    while (samples.length < SAMPLES.length && alive()) {
      setStep(samples.length);
      say(SAMPLES[samples.length]);
      let good = 0;
      const until = Date.now() + 30_000;
      while (alive() && good < 4) {
        if (Date.now() > until) throw new Error("I couldn't get a clear view of your face. Try somewhere brighter.");
        let f: FaceFrame | null = null;
        try { f = await inspect(video); } catch { f = null; }
        if (f && f.big && f.centered && f.ear > 0.2) { good += 1; say(SAMPLES[samples.length], true); } else { good = 0; say(f ? "Centre your face in the oval, eyes open" : "I can't see a face"); }
        await wait(120);
      }
      if (!alive()) return;
      const d = await describe(video);
      if (d) { samples.push(d); await wait(600); }
    }
    if (!alive()) return;
    say("Saving…", true);
    await api.post("/api/face/enroll", { descriptors: samples, consent: true, password });
    toast.success("Face ID is set up");
    onEnrolled();
  }

  if (!started) {
    return (
      <Panel className="space-y-5 p-5 sm:p-6">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-present" aria-hidden />
          <div className="space-y-2 text-sm">
            <p className="font-semibold">What is stored</p>
            <p className="text-muted">Only 128 numbers that describe your face. No photo or video is saved or sent. The camera runs on your device and switches off when you finish. You can remove Face ID at any time.</p>
          </div>
        </div>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-4 accent-[var(--ink)]" />
          <span>I agree to AttendAI storing these numbers to recognise me at check-in.</span>
        </label>
        <Field label="Confirm your password" hint="We ask so nobody can enrol a face on your account while you're away.">
          <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && <ErrorNote message={error} />}
        <Button variant="primary" disabled={!consent || !password} onClick={() => { setError(""); setStarted(true); }}><ScanFace className="size-4" aria-hidden /> Start</Button>
      </Panel>
    );
  }
  return (
    <div>
      <p className="mb-3 text-center text-sm text-muted">Photo {Math.min(step + 1, SAMPLES.length)} of {SAMPLES.length}</p>
      <FaceCamera run={run} onDone={() => undefined} onError={(m) => { setError(m); setStarted(false); }} />
    </div>
  );
}

export default function Face() {
  const toast = useToast();
  const { data: status, error, loading, reload } = useAsync(() => api.get<FaceStatus>("/api/face/status"));
  const [mode, setMode] = useState<Mode>("verify");
  const [punch, setPunch] = useState<PunchResult | null>(null);
  const [removing, setRemoving] = useState(false);

  async function remove() {
    if (!confirm("Remove your Face ID? You can set it up again whenever you like.")) return;
    setRemoving(true);
    try {
      await api.delete("/api/face/me");
      toast.success("Face ID removed");
      setMode("verify");
      reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRemoving(false);
    }
  }

  if (loading && !status) return <Loading />;
  if (error || !status) return <ErrorNote message={error ?? "Could not load Face ID."} onRetry={reload} />;

  const showEnroll = !status.enrolled || mode === "enroll";
  const a = punch?.attendance;
  const out = punch?.action === "check_out";

  return (
    <div className="mx-auto max-w-md">
      <PageHeader title="Face ID" subtitle={status.enrolled ? "Look at the camera, then blink or turn your head slightly to check in or out." : "Set up once, then check in with a glance."} />
      {punch && a ? (
        <Panel className="p-8 text-center">
          <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-present/15 text-present"><CircleCheck className="size-9" aria-hidden /></span>
          <h2 className="mt-4 font-display text-2xl font-bold">{out ? "Checked out" : "Checked in"} at {fmtTime(out ? a.check_out : a.check_in)}</h2>
          <p className="mt-1 text-muted">{out ? `You worked ${fmtMinutes(a.worked_minutes)} today.` : a.late_minutes ? `You were ${fmtMinutes(a.late_minutes)} late.` : "You're on time."}</p>
          <Link to="/" className={btn("primary", "mt-6 px-6")}>Back to dashboard</Link>
        </Panel>
      ) : showEnroll ? (
        <Enroll onEnrolled={() => { setMode("verify"); reload(); }} />
      ) : (
        <>
          <Verify status={status} onPunched={setPunch} />
          <div className="mt-10">
            <SectionTitle>Your Face ID</SectionTitle>
            <p className="mt-1 text-sm text-muted">Not recognised in poor light or after a big change like a new beard? Set it up again.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={() => setMode("enroll")}>Set up again</Button>
              <Button variant="ghost" loading={removing} onClick={remove}><Trash2 className="size-4" aria-hidden /> Remove</Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
