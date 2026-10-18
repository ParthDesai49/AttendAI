import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import QRCode from "qrcode";
import { ArrowLeft, Maximize2, Minimize2 } from "lucide-react";
import { Logo } from "../components/Logo";
import { ErrorNote } from "../components/ui";
import { api } from "../lib/api";

interface Token { token: string; expires_in: number; office: string }
const pad = (n: number) => String(n).padStart(2, "0");

/** Shows a QR code that changes every ~45 seconds, so a photo of it stops working soon after. Open it on a screen at the office entrance. */
export default function Kiosk() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [office, setOffice] = useState("");
  const [left, setLeft] = useState(0);
  const [total, setTotal] = useState(45);
  const [error, setError] = useState("");
  const [full, setFull] = useState(!!document.fullscreenElement);
  const [now, setNow] = useState(new Date());
  const deadline = useRef(0);
  const refreshing = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const t = await api.get<Token>("/api/qr/token");
      const url = `${window.location.origin}/scan?t=${encodeURIComponent(t.token)}`;
      await QRCode.toCanvas(canvas.current, url, { width: 480, margin: 2, errorCorrectionLevel: "M", color: { dark: "#0f1b2d", light: "#ffffff" } });
      deadline.current = Date.now() + t.expires_in * 1000;
      setTotal(t.expires_in);
      setOffice(t.office);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(() => {
      setNow(new Date());
      const secs = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000));
      setLeft(secs);
      if (deadline.current && secs <= 5 && !refreshing.current) {
        refreshing.current = true;
        refresh().finally(() => { refreshing.current = false; }); // swap in a new code just before the old one expires
      }
    }, 500);
    return () => clearInterval(id);
  }, [refresh]);
  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);

  const toggleFull = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {});
  const pct = total ? Math.min(100, (left / total) * 100) : 0;
  const h = now.getHours();

  return (
    <div className="flex min-h-dvh flex-col bg-hero text-hero-ink">
      <header className="flex items-center justify-between p-5 sm:p-8">
        <Logo />
        <div className="flex items-center gap-2">
          {!full && <Link to="/settings" className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm text-hero-muted hover:bg-white/10"><ArrowLeft className="size-4" aria-hidden /> Back</Link>}
          <button onClick={toggleFull} className="inline-flex h-10 items-center gap-2 rounded-lg bg-white/10 px-3 text-sm hover:bg-white/20">
            {full ? <Minimize2 className="size-4" aria-hidden /> : <Maximize2 className="size-4" aria-hidden />} {full ? "Exit full screen" : "Full screen"}
          </button>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-5 pb-10 text-center">
        <div>
          <p className="font-display text-5xl font-bold tabular-nums sm:text-7xl">{h % 12 || 12}:{pad(now.getMinutes())}<span className="ml-2 text-2xl text-hero-muted sm:text-3xl">{h >= 12 ? "pm" : "am"}</span></p>
          <p className="mt-2 text-hero-muted">{now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}{office && ` · ${office}`}</p>
        </div>

        {error ? (
          <div className="max-w-md text-left"><ErrorNote message={error} onRetry={refresh} /></div>
        ) : (
          <div className="rounded-[28px] bg-white p-4 shadow-2xl">
            <canvas ref={canvas} className="size-[min(72vw,56vh,480px)]" aria-label="Check-in QR code" />
          </div>
        )}

        <div className="w-full max-w-xs">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/15" role="progressbar" aria-label="Time until the code changes" aria-valuenow={left} aria-valuemin={0} aria-valuemax={total}>
            <div className="h-full rounded-full bg-mark transition-[width] duration-500 ease-linear" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-xs text-hero-muted">New code in {left}s</p>
        </div>
        <p className="max-w-sm text-hero-muted">Open AttendAI on your phone and scan this code, or use your phone's camera. Scan again when you leave.</p>
      </main>
    </div>
  );
}
