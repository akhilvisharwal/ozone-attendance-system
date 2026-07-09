import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Employee } from "@/types";
import { setAccessToken, setUnauthorizedHandler } from "@/api/client";
import * as authApi from "@/api/auth";
import type { SessionInfo } from "@/api/auth";

interface AuthContextValue {
  employee: Employee | null;
  isLoading: boolean;
  session: SessionInfo | null;
  login: (employeeId: string, password: string) => Promise<Employee>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function applySession(data: { accessToken: string; employee: Employee; session?: SessionInfo }) {
  setAccessToken(data.accessToken);
  return {
    employee: data.employee,
    session: data.session ?? null,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setEmployee(null);
    setSession(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(clearSession);
  }, [clearSession]);

  useEffect(() => {
    let cancelled = false;
    authApi
      .refresh()
      .then((data) => {
        if (cancelled) return;
        const next = applySession(data);
        setEmployee(next.employee);
        setSession(next.session);
      })
      .catch(() => {
        if (cancelled) return;
        clearSession();
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clearSession]);

  const login = useCallback(async (employeeId: string, password: string) => {
    const data = await authApi.login(employeeId, password);
    const next = applySession(data);
    setEmployee(next.employee);
    setSession(next.session);
    return next.employee;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const refreshMe = useCallback(async () => {
    const data = await authApi.refresh();
    const next = applySession(data);
    setEmployee(next.employee);
    setSession(next.session);
  }, []);

  const value = useMemo(
    () => ({ employee, isLoading, session, login, logout, refreshMe }),
    [employee, isLoading, session, login, logout, refreshMe]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
