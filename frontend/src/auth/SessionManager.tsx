import { useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { SessionTimeoutModal } from "@/components/SessionTimeoutModal";
import { OfflineStatusBanner } from "@/components/OfflineStatusBanner";
import { useAuthReconnect } from "@/hooks/useAuthReconnect";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useSessionTimeout } from "@/hooks/useSessionTimeout";

export function SessionManager() {
  const { employee, isBootstrapping, session, logout, refreshMe, revalidateSession } = useAuth();
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
    onSessionInvalid: handleExpire,
  });

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

  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (!event.persisted || !employee) return;
      void (async () => {
        const valid = await revalidateSession();
        if (!valid && !navigator.onLine) return;
        if (!valid) {
          await handleExpire();
        }
      })();
    };

    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, [employee, handleExpire, revalidateSession]);

  return (
    <>
      {enabled && !online ? <OfflineStatusBanner /> : null}
      <SessionTimeoutModal
        open={warningOpen}
        secondsRemaining={warningSecondsRemaining}
        onStaySignedIn={staySignedIn}
        onLogout={() => {
          void handleExpire();
        }}
      />
    </>
  );
}
