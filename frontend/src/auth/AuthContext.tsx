import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
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
  changePassword: (currentPassword: string, newPassword: string) => Promise<Employee>;
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
  /** Bumps when login/logout/changePassword establishes a new session — stale bootstrap refresh must not clear it. */
  const sessionEpochRef = useRef(0);

  const clearSession = useCallback(() => {
    sessionEpochRef.current += 1;
    setAccessToken(null);
    setEmployee(null);
    setSession(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(clearSession);
  }, [clearSession]);

  useEffect(() => {
    let cancelled = false;
    const epoch = sessionEpochRef.current;

    authApi
      .refresh()
      .then((data) => {
        if (cancelled || epoch !== sessionEpochRef.current) return;
        const next = applySession(data);
        setEmployee(next.employee);
        setSession(next.session);
      })
      .catch(() => {
        if (cancelled || epoch !== sessionEpochRef.current) return;
        setAccessToken(null);
        setEmployee(null);
        setSession(null);
      })
      .finally(() => {
        if (!cancelled && epoch === sessionEpochRef.current) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (employeeId: string, password: string) => {
    const data = await authApi.login(employeeId, password);
    sessionEpochRef.current += 1;
    const next = applySession(data);
    setEmployee(next.employee);
    setSession(next.session);
    setIsLoading(false);
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
    sessionEpochRef.current += 1;
    const next = applySession(data);
    setEmployee(next.employee);
    setSession(next.session);
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const data = await authApi.changePassword(currentPassword, newPassword);
    sessionEpochRef.current += 1;
    const next = applySession(data);
    setEmployee(next.employee);
    setSession(next.session);
    return next.employee;
  }, []);

  const value = useMemo(
    () => ({ employee, isLoading, session, login, logout, refreshMe, changePassword }),
    [employee, isLoading, session, login, logout, refreshMe, changePassword]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
