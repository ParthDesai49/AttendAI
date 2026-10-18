import { useEffect, useState } from "react";
import { fmtMinutes } from "../lib/format";

const TICKS = 48; // one tick per 10 minutes of an 8 hour day
const RADIUS = 88;
const CIRC = 2 * Math.PI * RADIUS;
const DONE = "#5be3a4";

/** The watch-face for the working day: ticks and the arc fill as hours are worked. */
export function Dial({ minutes, target = 480, state, size = 220 }: {
  minutes: number; target?: number; state: "idle" | "working" | "done"; size?: number;
}) {
  const pct = Math.min(1, Math.max(0, minutes / target));
  const [shown, setShown] = useState(0); // starts empty so the arc sweeps in once on load
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(pct));
    return () => cancelAnimationFrame(id);
  }, [pct]);

  const lit = Math.round(pct * TICKS);
  const color = state === "done" ? DONE : "var(--mark)";

  return (
    <svg viewBox="0 0 240 240" width={size} height={size} role="img" aria-label={`${fmtMinutes(minutes)} worked today`}>
      {Array.from({ length: TICKS }, (_, i) => {
        const a = (i / TICKS) * 2 * Math.PI - Math.PI / 2;
        const major = i % 6 === 0;
        const r1 = 117, r2 = major ? 105 : 110;
        return (
          <line
            key={i}
            x1={120 + r1 * Math.cos(a)} y1={120 + r1 * Math.sin(a)}
            x2={120 + r2 * Math.cos(a)} y2={120 + r2 * Math.sin(a)}
            stroke={i < lit ? color : "var(--hero-line)"} strokeWidth={major ? 2.5 : 1.5} strokeLinecap="round"
          />
        );
      })}
      <circle cx="120" cy="120" r={RADIUS} fill="none" stroke="var(--hero-line)" strokeWidth="10" />
      <circle
        cx="120" cy="120" r={RADIUS} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
        strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - shown)} strokeOpacity={shown > 0 ? 1 : 0}
        transform="rotate(-90 120 120)" style={{ transition: "stroke-dashoffset 900ms cubic-bezier(.2,.8,.2,1)" }}
      />
      <text x="120" y="123" textAnchor="middle" className="font-display" fontSize="36" fontWeight="700" fill="var(--hero-ink)">
        {fmtMinutes(minutes)}
      </text>
      <text x="120" y="146" textAnchor="middle" fontSize="12.5" fill="var(--hero-muted)">worked today</text>
    </svg>
  );
}
