import { cx } from "./ui";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2 font-display text-xl font-bold tracking-tight", className)}>
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
        <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" strokeWidth="3" opacity=".22" />
        <path d="M16 3a13 13 0 0 1 11.3 6.5" fill="none" stroke="var(--mark)" strokeWidth="3.4" strokeLinecap="round" />
        <path d="M10.5 16.5l4 4 7-8" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      AttendAI
    </span>
  );
}
