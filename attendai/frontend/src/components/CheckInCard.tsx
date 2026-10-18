import { useState } from "react";
import { Link } from "react-router-dom";
import { MapPin, QrCode, ScanFace } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useNow } from "../hooks/useNow";
import { api } from "../lib/api";
import { fmtMinutes, fmtShift, fmtTime } from "../lib/format";
import type { Attendance } from "../lib/types";
import { Dial } from "./Dial";
import { useToast } from "./Toast";
import { btn, Button } from "./ui";

type Action = "web" | "geo" | "out";
const pad = (n: number) => String(n).padStart(2, "0");

export function CheckInCard({ attendance, onChanged }: { attendance: Attendance | null | undefined; onChanged: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const now = useNow();
  const [busy, setBusy] = useState<Action | null>(null);

  const a = attendance ?? null;
  const state = !a?.check_in ? "idle" : a.check_out ? "done" : "working";
  const minutes = !a?.check_in ? 0 : a.check_out ? a.worked_minutes : (now.getTime() - new Date(a.check_in).getTime()) / 60000;

  async function run(action: Action) {
    setBusy(action);
    try {
      if (action === "out") {
        await api.post("/api/attendance/check-out");
      } else if (action === "web") {
        await api.post("/api/attendance/check-in", { method: "web" });
      } else {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 }));
        await api.post("/api/attendance/check-in", {
          method: "geo", latitude: pos.coords.latitude, longitude: pos.coords.longitude, work_mode: "office",
        });
      }
      toast.success(action === "out" ? "Checked out" : "Checked in");
      onChanged();
    } catch (e) {
      toast.error(e instanceof GeolocationPositionError ? "Allow location access to check in with GPS." : (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  let headline = "You haven't checked in yet.";
  let detail = user?.shift ? `Your shift starts at ${fmtShift(user.shift.start_time)}.` : "";
  if (a && state === "working") {
    headline = `Checked in at ${fmtTime(a.check_in)}.`;
    detail = a.late_minutes ? `You were ${fmtMinutes(a.late_minutes)} late.` : "You were on time.";
  } else if (a && state === "done") {
    headline = `Checked out at ${fmtTime(a.check_out)}.`;
    detail = `You worked ${fmtMinutes(a.worked_minutes)}${a.overtime_minutes ? `, including ${fmtMinutes(a.overtime_minutes)} of overtime` : ""}.`;
  }

  const h = now.getHours();
  return (
    <section aria-label="Your attendance today" className="grid items-center gap-6 rounded-[28px] bg-hero p-6 text-hero-ink sm:grid-cols-[auto_minmax(0,1fr)] sm:p-8">
      <div className="mx-auto"><Dial minutes={minutes} state={state} /></div>
      <div>
        <p className="text-sm text-hero-muted">
          {now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
        </p>
        <p className="mt-1 flex items-baseline font-display font-bold leading-none tracking-tight">
          <span className="text-6xl">{h % 12 || 12}:{pad(now.getMinutes())}</span>
          <span className="inline-block w-[1.6em] text-left text-2xl text-hero-muted">:{pad(now.getSeconds())}</span>
          <span className="text-lg text-hero-muted">{h >= 12 ? "pm" : "am"}</span>
        </p>
        <p className="mt-4 text-lg font-medium">{headline}</p>
        <p className="text-sm text-hero-muted">{detail}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          {state === "idle" && (
            <>
              <Button variant="primary" className="h-11 px-6" loading={busy === "web"} disabled={!!busy} onClick={() => run("web")}>Check in</Button>
              <Button variant="hero" className="h-11" loading={busy === "geo"} disabled={!!busy} onClick={() => run("geo")}>
                <MapPin className="size-4" aria-hidden /> GPS
              </Button>
              <Link to="/scan" className={btn("hero", "h-11")}><QrCode className="size-4" aria-hidden /> Scan QR</Link>
              <Link to="/face" className={btn("hero", "h-11")}><ScanFace className="size-4" aria-hidden /> Face ID</Link>
            </>
          )}
          {state === "working" && (
            <>
              <Button variant="primary" className="h-11 px-6" loading={busy === "out"} onClick={() => run("out")}>Check out</Button>
              <Link to="/scan" className={btn("hero", "h-11")}><QrCode className="size-4" aria-hidden /> Scan QR</Link>
              <Link to="/face" className={btn("hero", "h-11")}><ScanFace className="size-4" aria-hidden /> Face ID</Link>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
