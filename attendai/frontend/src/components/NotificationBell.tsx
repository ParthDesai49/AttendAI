import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck } from "lucide-react";
import { api } from "../lib/api";
import { timeAgo } from "../lib/format";
import type { NotificationList } from "../lib/types";
import { cx } from "./ui";

const EMPTY: NotificationList = { unread: 0, items: [] };

/** Bell with a dropdown. It checks for news every 30 seconds and when the tab comes back into view. */
export function NotificationBell({ className, align = "left" }: { className?: string; align?: "left" | "right" }) {
  const nav = useNavigate();
  const [data, setData] = useState<NotificationList>(EMPTY);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    api.get<NotificationList>("/api/notifications?limit=15").then(setData).catch(() => undefined); // the bell is optional, so stay quiet on errors
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVisible); };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  async function pick(id: number, link: string | null) {
    setOpen(false);
    setData((d) => ({ unread: Math.max(0, d.unread - (d.items.find((i) => i.id === id && !i.is_read) ? 1 : 0)), items: d.items.map((i) => (i.id === id ? { ...i, is_read: true } : i)) }));
    api.post(`/api/notifications/${id}/read`).catch(() => undefined);
    if (link?.startsWith("/")) nav(link);
  }
  async function readAll() {
    setData((d) => ({ unread: 0, items: d.items.map((i) => ({ ...i, is_read: true })) }));
    api.post("/api/notifications/read-all").catch(() => undefined);
  }

  return (
    <div ref={box} className={cx("relative", className)}>
      <button
        onClick={() => { setOpen((o) => !o); if (!open) load(); }}
        aria-label={data.unread ? `Notifications, ${data.unread} unread` : "Notifications"} aria-expanded={open} aria-haspopup="true"
        className="relative rounded-lg p-2 text-muted transition hover:bg-sunken hover:text-ink"
      >
        <Bell className="size-[18px] md:size-[18px]" aria-hidden />
        {data.unread > 0 && (
          <span className="absolute right-0.5 top-0.5 flex min-w-4 items-center justify-center rounded-full bg-absent px-1 text-[10px] font-bold leading-4 text-white">
            {data.unread > 9 ? "9+" : data.unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog" aria-label="Notifications"
          className={cx("fixed inset-x-3 top-16 z-50 max-h-[70dvh] animate-sheet overflow-y-auto rounded-2xl border border-line bg-surface shadow-xl md:absolute md:inset-x-auto md:top-full md:mt-2 md:w-80",
            align === "left" ? "md:left-0" : "md:right-0")}
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="font-display text-base font-semibold">Notifications</h2>
            {data.unread > 0 && (
              <button onClick={readAll} className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-ink"><CheckCheck className="size-3.5" aria-hidden /> Mark all read</button>
            )}
          </div>
          {data.items.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted">You're all caught up.</p>
          ) : (
            <ul>
              {data.items.map((n) => (
                <li key={n.id} className="border-b border-line last:border-0">
                  <button onClick={() => pick(n.id, n.link)} className="flex w-full gap-3 px-4 py-3 text-left transition hover:bg-sunken">
                    <span className={cx("mt-1.5 size-2 shrink-0 rounded-full", n.is_read ? "bg-transparent" : "bg-leave")} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className={cx("block text-sm", n.is_read ? "text-muted" : "font-semibold")}>{n.title}</span>
                      <span className="mt-0.5 line-clamp-2 block text-xs text-muted">{n.message}</span>
                      <span className="mt-1 block text-[11px] text-muted">{timeAgo(n.created_at)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
