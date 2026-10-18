import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type Theme = "light" | "dark";
const Ctx = createContext<{ theme: Theme; toggle: () => void } | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  // index.html applies the saved/system theme before React loads, so there is no flash
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.classList.contains("dark") ? "dark" : "light"));

  const toggle = useCallback(() => {
    const next: Theme = document.documentElement.classList.contains("dark") ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    try { localStorage.setItem("attendai_theme", next); } catch { /* storage unavailable */ }
    setTheme(next);
  }, []);

  const value = useMemo(() => ({ theme, toggle }), [theme, toggle]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTheme must be used inside ThemeProvider");
  return v;
}
