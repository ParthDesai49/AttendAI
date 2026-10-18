import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, tokenStore } from "../lib/api";
import type { Employee, LoginResponse } from "../lib/types";

interface AuthValue {
  user: Employee | null;
  loading: boolean;
  isApprover: boolean; // admin, HR or manager
  isHR: boolean; // admin or HR
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}
const Ctx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(() => !!tokenStore.get());

  useEffect(() => {
    if (!tokenStore.get()) return;
    api.get<Employee>("/api/auth/me").then(setUser).catch(() => tokenStore.clear()).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onExpired = () => setUser(null);
    window.addEventListener("auth:expired", onExpired);
    return () => window.removeEventListener("auth:expired", onExpired);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<LoginResponse>("/api/auth/login", { email, password });
    tokenStore.set(res.access_token);
    setUser(res.user);
  }, []);
  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      user, loading, login, logout,
      isApprover: !!user && user.role !== "employee",
      isHR: !!user && (user.role === "admin" || user.role === "hr"),
    }),
    [user, loading, login, logout],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
}
