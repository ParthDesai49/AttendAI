import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { Loader2, TriangleAlert, X } from "lucide-react";
import { STATUS, type Tone } from "../lib/format";
import type { AttStatus } from "../lib/types";

export const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" ");

/* Tailwind only sees complete class names, so every tone is spelled out here. */
export const TONES: Record<Tone | "mark", string> = {
  present: "bg-present/15 text-present",
  late: "bg-late/15 text-late",
  absent: "bg-absent/15 text-absent",
  leave: "bg-leave/15 text-leave",
  idle: "bg-idle/15 text-idle",
  mark: "bg-mark text-mark-ink",
};
export const TINT: Record<Tone, string> = {
  present: "bg-present/15", late: "bg-late/15", absent: "bg-absent/15", leave: "bg-leave/15", idle: "bg-idle/15",
};
export const DOT: Record<Tone, string> = {
  present: "bg-present", late: "bg-late", absent: "bg-absent", leave: "bg-leave", idle: "bg-idle",
};

type Variant = "primary" | "secondary" | "ghost" | "danger" | "hero";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-mark text-mark-ink font-semibold hover:brightness-95",
  secondary: "border border-line bg-surface text-ink hover:bg-sunken",
  ghost: "text-ink hover:bg-sunken",
  danger: "bg-absent text-white font-semibold hover:brightness-95",
  hero: "bg-white/10 text-hero-ink hover:bg-white/20",
};

/** Button styling as a function, so links can look like buttons without nesting a button in an anchor. */
export const btn = (variant: Variant = "secondary", className?: string) =>
  cx("inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50", VARIANTS[variant], className);

export function Button({
  variant = "secondary", loading, className, children, disabled, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={btn(variant, className)}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Badge({ tone = "idle", children }: { tone?: Tone | "mark"; children: ReactNode }) {
  return <span className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", TONES[tone])}>{children}</span>;
}
export function StatusBadge({ status }: { status: AttStatus }) {
  const s = STATUS[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export const Panel = ({ className, children }: { className?: string; children: ReactNode }) => (
  <div className={cx("rounded-2xl border border-line bg-surface", className)}>{children}</div>
);

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const initials = name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  let hue = 0;
  for (const ch of name) hue = (hue * 31 + ch.charCodeAt(0)) % 360;
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-ink"
      style={{ width: size, height: size, fontSize: size * 0.38, background: `hsl(${hue} 65% 55% / 0.24)` }}
    >
      {initials}
    </span>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
      </div>
      {actions}
    </header>
  );
}

export const SectionTitle = ({ children, aside }: { children: ReactNode; aside?: ReactNode }) => (
  <div className="mb-4 flex items-center justify-between gap-3">
    <h2 className="font-display text-xl font-semibold tracking-tight">{children}</h2>
    {aside}
  </div>
);

/** A row of key figures, each with a short rule on its left. */
export function Figures({ items }: { items: { value: string; label: string }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-4">
      {items.map((i) => (
        <div key={i.label} className="flex flex-col-reverse border-l-2 border-line pl-4">
          <dt className="text-sm text-muted">{i.label}</dt>
          <dd className="font-display text-3xl font-bold tracking-tight">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: {
  value: T; onChange: (v: T) => void; items: { id: T; label: string; badge?: number }[];
}) {
  return (
    <div role="tablist" className="mb-6 flex gap-6 border-b border-line">
      {items.map((t) => (
        <button
          key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={cx("-mb-px flex items-center gap-2 border-b-2 pb-3 text-sm font-semibold transition",
            value === t.id ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink")}
        >
          {t.label}
          {!!t.badge && <span className="rounded-full bg-mark px-2 py-0.5 text-xs text-mark-ink">{t.badge}</span>}
        </button>
      ))}
    </div>
  );
}

export function Chips<T extends string>({ value, onChange, items }: {
  value: T; onChange: (v: T) => void; items: { id: T; label: string }[];
}) {
  return (
    <div role="group" className="flex flex-wrap gap-2">
      {items.map((i) => (
        <button
          key={i.id} aria-pressed={value === i.id} onClick={() => onChange(i.id)}
          className={cx("h-8 rounded-full border px-3.5 text-sm font-medium transition",
            value === i.id ? "border-ink bg-ink text-paper" : "border-line text-muted hover:text-ink")}
        >
          {i.label}
        </button>
      ))}
    </div>
  );
}

export const Loading = ({ label = "Loading" }: { label?: string }) => (
  <div role="status" className="flex items-center justify-center gap-2 py-16 text-muted">
    <Loader2 className="size-5 animate-spin" aria-hidden /> {label}
  </div>
);

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-absent/40 bg-absent/10 px-4 py-3 text-sm">
      <TriangleAlert className="size-4 shrink-0 text-absent" aria-hidden />
      <span>{message}</span>
      {onRetry && <Button className="ml-auto h-8" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

export const Empty = ({ title, body }: { title: string; body?: string }) => (
  <div className="py-12 text-center">
    <p className="font-display text-lg font-semibold">{title}</p>
    {body && <p className="mt-1 text-sm text-muted">{body}</p>}
  </div>
);

const FIELD =
  "h-10 rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-muted disabled:opacity-60";
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}
const width = (c?: string) => (/\bw-/.test(c ?? "") ? undefined : "w-full"); // full width unless the caller sets one
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx(FIELD, width(p.className), p.className)} />;
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cx(FIELD, width(p.className), p.className)} />;
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea {...p} className={cx(FIELD, width(p.className), "h-auto min-h-20 py-2", p.className)} />
);

export function Modal({ open, onClose, title, children, footer }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-ink/50" onClick={onClose} />
      <div
        role="dialog" aria-modal="true" aria-label={title}
        className="relative max-h-[92dvh] w-full animate-sheet overflow-y-auto rounded-t-3xl border border-line bg-surface sm:max-w-lg sm:rounded-2xl"
      >
        <div className="flex items-center justify-between px-5 pb-2 pt-5">
          <h2 className="font-display text-xl font-semibold">{title}</h2>
          <button aria-label="Close" onClick={onClose} className="rounded-lg p-2 hover:bg-sunken"><X className="size-5" /></button>
        </div>
        <div className="px-5 pb-5">{children}</div>
        {footer && <div className="sticky bottom-0 flex justify-end gap-2 border-t border-line bg-surface px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}
