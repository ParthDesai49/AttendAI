import { useMemo } from "react";
import { useTheme } from "../context/ThemeContext";

/** Reads the live CSS tokens so Recharts follows the light/dark theme. */
export function useChartColors() {
  const { theme } = useTheme();
  return useMemo(() => {
    const s = getComputedStyle(document.documentElement);
    const g = (n: string) => s.getPropertyValue(n).trim();
    return {
      present: g("--present"), late: g("--late"), absent: g("--absent"), leave: g("--leave"),
      line: g("--line"), muted: g("--muted"), ink: g("--ink"), surface: g("--surface"), sunken: g("--sunken"),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);
}
