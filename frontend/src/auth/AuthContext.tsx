import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Employee } from "@/types";
import { isAuthError, isNetworkError, setAccessToken, setUnauthorizedHandler } from "@/api/client";
import * as authApi from "@/api/auth";
import type { SessionInfo } from "@/api/auth";
import {
  clearBrowserSession,
  hasBrowserSession,
  markBrowserSession,
} from "@/auth/browserSession";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

interface AuthContextValue {
  employee: Employee | null;
  /** True while the initial session is being validated with the backend. */
  isBootstrapping: boolean;
  /** @deprecated Use isBootstrapping — kept for gradual migration. */
  isLoading: boolean;
  /** True when connectivity is unavailable during session validation. */
  isOffline: boolean;
  /** True when retrying session validation after coming back online. */
  isReconnecting: boolean;
  session: SessionInfo | null;
  login: (employeeId: string, password: string) => Promise<Employee>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
  /** Silently re-check the session with the backend (no full-page loader). */
  revalidateSession: () => Promise<boolean>;
  /** Instantly update the signed-in employee in memory (e.g. after avatar upload). */
  setEmployee: (employee: Employee | null) => void;
  changePassword: (currentPassword: string, newPassword: string) => Promise<Employee>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function applySession(data: { accessToken: string; employee: Employee; session?: SessionInfo }) {
  setAccessToken(data.accessToken);
  markBrowserSession();
  return {
    employee: data.employee,
    session: data.session ?? null,
  };
}

async function clearStaleRefreshCookie() {
  try {
    await authApi.logout();
  } catch {
    // Cookie may already be missing or unreachable — still clear client state.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const online = useOnlineStatus();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isOffline, setIsOffline] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  /** Bumps when login/logout/changePassword establishes a new session — stale bootstrap refresh must not clear it. */
  const sessionEpochRef = useRef(0);
  const bootstrapAttemptRef = useRef(0);

  const clearSession = useCallback(() => {
    sessionEpochRef.current += 1;
    clearBrowserSession();
    setAccessToken(null);
    setEmployee(null);
    setSession(null);
    setIsOffline(false);
    setReconnecting(false);
  }, []);

  const establishSession = useCallback(
    (data: { accessToken: string; employee: Employee; session?: SessionInfo }) => {
      const next = applySession(data);
      setEmployee(next.employee);
      setSession(next.session);
      setIsOffline(false);
      setReconnecting(false);
    },
    []
  );

  const runBootstrap = useCallback(async () => {
    const attempt = ++bootstrapAttemptRef.current;
    const epoch = sessionEpochRef.current;

    if (!hasBrowserSession()) {
      await clearStaleRefreshCookie();
      if (attempt !== bootstrapAttemptRef.current || epoch !== sessionEpochRef.current) return false;
      clearSession();
      return false;
    }

    try {
      const data = await authApi.refresh();
      if (attempt !== bootstrapAttemptRef.current || epoch !== sessionEpochRef.current) return false;
      establishSession(data);
      return true;
    } catch (error) {
      if (attempt !== bootstrapAttemptRef.current || epoch !== sessionEpochRef.current) return false;
      if (isNetworkError(error)) {
        setIsOffline(true);
        setReconnecting(false);
        return false;
      }
      if (isAuthError(error)) {
        await clearStaleRefreshCookie();
      }
      clearSession();
      return false;
    }
  }, [clearSession, establishSession]);

  useEffect(() => {
    setUnauthorizedHandler(clearSession);
  }, [clearSession]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      await runBootstrap();
      if (!cancelled) {
        setIsBootstrapping(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [runBootstrap]);

  useEffect(() => {
    if (isBootstrapping || !isOffline || !online) return;

    let cancelled = false;
    setReconnecting(true);

    void (async () => {
      await runBootstrap();
      if (!cancelled) {
        setReconnecting(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isBootstrapping, isOffline, online, runBootstrap]);

  const login = useCallback(
    async (employeeId: string, password: string) => {
      const data = await authApi.login(employeeId, password);
      sessionEpochRef.current += 1;
      const next = applySession(data);
      setEmployee(next.employee);
      setSession(next.session);
      setIsBootstrapping(false);
      setIsOffline(false);
      setReconnecting(false);
      return next.employee;
    },
    []
  );

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

  const revalidateSession = useCallback(async () => {
    if (!hasBrowserSession()) {
      await clearStaleRefreshCookie();
      clearSession();
      return false;
    }

    try {
      const data = await authApi.refresh();
      sessionEpochRef.current += 1;
      establishSession(data);
      return true;
    } catch (error) {
      if (isNetworkError(error)) {
        setIsOffline(true);
        return false;
      }
      await clearStaleRefreshCookie();
      clearSession();
      return false;
    }
  }, [clearSession, establishSession]);

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
      isOffline,
      isReconnecting: reconnecting,
      session,
      login,
      logout,
      refreshMe,
      revalidateSession,
      setEmployee,
      changePassword,
    }),
    [
      employee,
      isBootstrapping,
      isOffline,
      reconnecting,
      session,
      login,
      logout,
      refreshMe,
      revalidateSession,
      changePassword,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
