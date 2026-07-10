import { useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { SessionTimeoutModal } from "@/components/SessionTimeoutModal";
import { useAuthReconnect } from "@/hooks/useAuthReconnect";
import { useSessionTimeout } from "@/hooks/useSessionTimeout";

export function SessionManager() {
  const { employee, isLoading, session, logout, refreshMe } = useAuth();
  const navigate = useNavigate();
  const enabled = Boolean(employee) && !isLoading;

  const handleExpire = useCallback(async () => {
    try {
      await logout();
    } finally {
      navigate("/login", { replace: true });
    }
  }, [logout, navigate]);

  const handleRestored = useCallback(async () => {
    try {
      await refreshMe();
    } catch {
      await handleExpire();
    }
  }, [handleExpire, refreshMe]);

  const { warningOpen, warningSecondsRemaining, staySignedIn } = useSessionTimeout({
    enabled,
    onExpire: handleExpire,
    initialLastActivityAt: session?.lastActivityAt,
  });

  useAuthReconnect({
    enabled,
    onRestored: handleRestored,
  });

  useEffect(() => {
    if (!employee || employee.role !== "junior_admin") return;
    const onFocus = () => {
      void refreshMe();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [employee, refreshMe]);

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
