import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Employee } from "@/types";
import { setAccessToken, setUnauthorizedHandler } from "@/api/client";
import * as authApi from "@/api/auth";
import type { SessionInfo } from "@/api/auth";

interface AuthContextValue {
  employee: Employee | null;
  /** True only while clearing any leftover cookie/storage on first paint. */
  isBootstrapping: boolean;
  /** @deprecated Use isBootstrapping — kept for gradual migration. */
  isLoading: boolean;
  session: SessionInfo | null;
  login: (employeeId: string, password: string) => Promise<Employee>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
  /** Instantly update the signed-in employee in memory (e.g. after avatar upload). */
  setEmployee: (employee: Employee | null) => void;
  changePassword: (currentPassword: string, newPassword: string) => Promise<Employee>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/** Wipe client-side auth and app caches. Does not touch httpOnly cookies (server logout does). */
function wipeClientStorage() {
  try {
    sessionStorage.clear();
  } catch {
    // Ignore quota / private-mode errors.
  }
  try {
    localStorage.clear();
  } catch {
    // Ignore quota / private-mode errors.
  }
}

async function revokeServerSession() {
  try {
    await authApi.logout();
  } catch {
    // Cookie may already be missing or unreachable.
  }
}

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
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  /** Bumps when login/logout/changePassword establishes a new session. */
  const sessionEpochRef = useRef(0);
  const employeeRef = useRef<Employee | null>(null);

  useEffect(() => {
    employeeRef.current = employee;
  }, [employee]);

  const clearSession = useCallback(() => {
    sessionEpochRef.current += 1;
    setAccessToken(null);
    setEmployee(null);
    setSession(null);
    wipeClientStorage();
  }, []);

  // On every page load / reopen: never restore a session. Revoke leftover refresh cookie and wipe storage.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      await revokeServerSession();
      if (cancelled) return;
      clearSession();
      setIsBootstrapping(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [clearSession]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearSession();
    });
  }, [clearSession]);

  // Tab/browser close or hard navigation: revoke server session so the cookie cannot be reused.
  useEffect(() => {
    const revokeOnUnload = () => {
      if (!employeeRef.current) return;
      try {
        void fetch("/api/auth/logout", {
          method: "POST",
          credentials: "include",
          keepalive: true,
        });
      } catch {
        // Best-effort during unload.
      }
      setAccessToken(null);
      wipeClientStorage();
    };

    window.addEventListener("pagehide", revokeOnUnload);
    window.addEventListener("beforeunload", revokeOnUnload);
    return () => {
      window.removeEventListener("pagehide", revokeOnUnload);
      window.removeEventListener("beforeunload", revokeOnUnload);
    };
  }, []);

  // Losing connectivity while signed in ends the session (no offline persistence).
  useEffect(() => {
    if (!employee) return;

    const onOffline = () => {
      void (async () => {
        await revokeServerSession();
        clearSession();
      })();
    };

    window.addEventListener("offline", onOffline);
    return () => window.removeEventListener("offline", onOffline);
  }, [employee, clearSession]);

  const login = useCallback(async (employeeId: string, password: string) => {
    const data = await authApi.login(employeeId, password);
    sessionEpochRef.current += 1;
    const next = applySession(data);
    setEmployee(next.employee);
    setSession(next.session);
    setIsBootstrapping(false);
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
    if (!employeeRef.current) {
      throw new Error("Not authenticated");
    }
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
    () => ({
      employee,
      isBootstrapping,
      isLoading: isBootstrapping,
      session,
      login,
      logout,
      refreshMe,
      setEmployee,
      changePassword,
    }),
    [employee, isBootstrapping, session, login, logout, refreshMe, changePassword]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
