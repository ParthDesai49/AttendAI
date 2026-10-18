import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { CircleAlert, CircleCheck } from "lucide-react";

interface ToastItem { id: number; kind: "success" | "error"; message: string }
interface ToastApi { success: (message: string) => void; error: (message: string) => void }
const Ctx = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const push = useCallback((kind: ToastItem["kind"], message: string) => {
    const id = ++seq.current;
    setItems((l) => [...l, { id, kind, message }]);
    setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), 4500);
  }, []);
  const value = useMemo<ToastApi>(() => ({ success: (m) => push("success", m), error: (m) => push("error", m) }), [push]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6 md:items-end md:px-6">
        {items.map((t) => (
          <div key={t.id} role="status" className="pointer-events-auto flex max-w-sm animate-sheet items-center gap-2.5 rounded-xl bg-hero px-4 py-3 text-sm font-medium text-hero-ink shadow-lg">
            {t.kind === "success"
              ? <CircleCheck className="size-4 shrink-0 text-[#5be3a4]" aria-hidden />
              : <CircleAlert className="size-4 shrink-0 text-mark" aria-hidden />}
            {t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useToast must be used inside ToastProvider");
  return v;
}
