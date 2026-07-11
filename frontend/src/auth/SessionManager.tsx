import { useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { SessionTimeoutModal } from "@/components/SessionTimeoutModal";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useSessionTimeout } from "@/hooks/useSessionTimeout";

export function SessionManager() {
  const { employee, isBootstrapping, session, logout, refreshMe } = useAuth();
  const navigate = useNavigate();
  const online = useOnlineStatus();
  const enabled = Boolean(employee) && !isBootstrapping;

  const handleExpire = useCallback(async () => {
    try {
      await logout();
    } finally {
      navigate("/login", { replace: true });
    }
  }, [logout, navigate]);

  const { warningOpen, warningSecondsRemaining, staySignedIn } = useSessionTimeout({
    enabled,
    onExpire: handleExpire,
    initialLastActivityAt: session?.lastActivityAt,
  });

  // Offline while signed in → force login again (AuthContext also clears; ensure redirect).
  useEffect(() => {
    if (!enabled) return;
    if (online) return;
    void handleExpire();
  }, [enabled, online, handleExpire]);

  // Junior-admin permission changes: refresh in-tab only; failure ends the session.
  useEffect(() => {
    if (!employee || employee.role !== "junior_admin") return;
    const onFocus = () => {
      void refreshMe().catch(() => {
        void handleExpire();
      });
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [employee, handleExpire, refreshMe]);

  // bfcache restore must not resurrect a session — always require login.
  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      void handleExpire();
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, [handleExpire]);

  return (
    <SessionTimeoutModal
      open={warningOpen}
      secondsRemaining={warningSecondsRemaining}
      onStaySignedIn={staySignedIn}
      onLogout={() => {
        void handleExpire();
      }}
    />
  );
}
