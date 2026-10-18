import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { CalendarCheck, CalendarDays, ChartColumn, ClipboardPen, Clock3, LayoutDashboard, LogOut, Moon, ScanFace, Settings, Sun, UserRound, Users } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { ROLE_LABEL } from "../lib/format";
import { Logo } from "./Logo";
import { NotificationBell } from "./NotificationBell";
import { Avatar, cx } from "./ui";

export function Layout() {
  const { user, logout: signOut, isApprover, isHR } = useAuth();
  const nav = useNavigate();
  const logout = () => { nav("/login", { replace: true }); signOut(); }; // go to a clean sign-in page, not one that remembers this page
  const { theme, toggle } = useTheme();
  if (!user) return null;

  const items = [
    { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
    { to: "/attendance", label: "Attendance", icon: CalendarCheck, end: false },
    { to: "/leave", label: "Leave", icon: CalendarDays, end: false },
    ...(isApprover ? [
      { to: "/employees", label: "People", icon: Users, end: false },
      { to: "/reports", label: "Reports", icon: ChartColumn, end: false },
    ] : []),
  ];
  const extra = [
    { to: "/corrections", label: "Corrections", icon: ClipboardPen },
    { to: "/face", label: "Face ID", icon: ScanFace },
    ...(isHR ? [
      { to: "/organisation", label: "Shifts and teams", icon: Clock3 },
      { to: "/settings", label: "Check-in setup", icon: Settings },
    ] : []),
  ];
  const ThemeIcon = theme === "dark" ? Sun : Moon;
  const themeLabel = theme === "dark" ? "Light theme" : "Dark theme";

  return (
    <div className="min-h-dvh">
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-line bg-surface p-4 md:flex">
        <div className="flex items-center justify-between pr-1">
          <Logo className="px-2 py-3" />
          <NotificationBell align="left" />
        </div>
        <nav className="mt-6 flex flex-col gap-1" aria-label="Main">
          {items.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to} to={to} end={end}
              className={({ isActive }) => cx("flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition",
                isActive ? "bg-hero text-hero-ink" : "text-muted hover:bg-sunken hover:text-ink")}
            >
              <Icon className="size-[18px]" aria-hidden /> {label}
            </NavLink>
          ))}
          <div className="my-2 border-t border-line" />
          {extra.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to} to={to}
              className={({ isActive }) => cx("flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition",
                isActive ? "bg-hero text-hero-ink" : "text-muted hover:bg-sunken hover:text-ink")}
            >
              <Icon className="size-[18px]" aria-hidden /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-3">
          <button onClick={toggle} className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted transition hover:bg-sunken hover:text-ink">
            <ThemeIcon className="size-[18px]" aria-hidden /> {themeLabel}
          </button>
          <div className="flex items-center gap-3 border-t border-line pt-4">
            <NavLink to="/profile" aria-label="Your profile" className="flex min-w-0 flex-1 items-center gap-3 rounded-lg hover:opacity-80">
              <Avatar name={user.full_name} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{user.full_name}</p>
                <p className="truncate text-xs text-muted">{user.designation ?? ROLE_LABEL[user.role]}</p>
              </div>
            </NavLink>
            <button onClick={logout} aria-label="Sign out" className="rounded-lg p-2 text-muted hover:bg-sunken hover:text-ink">
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-surface/90 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur md:hidden">
        <Logo />
        <div className="flex items-center gap-0.5">
          <NotificationBell align="right" />
          {isHR && (
            <NavLink to="/settings" aria-label="Check-in setup" className="rounded-lg p-2 text-muted hover:bg-sunken"><Settings className="size-5" /></NavLink>
          )}
          <NavLink to="/profile" aria-label="Your profile" className="rounded-lg p-2 text-muted hover:bg-sunken"><UserRound className="size-5" /></NavLink>
          <button onClick={toggle} aria-label={themeLabel} className="rounded-lg p-2 text-muted hover:bg-sunken"><ThemeIcon className="size-5" /></button>
          <button onClick={logout} aria-label="Sign out" className="rounded-lg p-2 text-muted hover:bg-sunken"><LogOut className="size-5" /></button>
        </div>
      </header>

      <main className="md:pl-60">
        <div className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 md:px-10 md:pb-12 md:pt-10">
          <Outlet />
        </div>
      </main>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className="flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium">
            {({ isActive }) => (
              <>
                <span className={cx("flex h-7 w-12 items-center justify-center rounded-full transition", isActive ? "bg-mark text-mark-ink" : "text-muted")}>
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className={isActive ? "text-ink" : "text-muted"}>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
