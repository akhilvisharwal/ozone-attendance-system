import { useCallback, useEffect, useRef, useState } from "react";
import * as authApi from "@/api/auth";
import { usePublicSettings } from "@/contexts/SettingsContext";
import {
  getWarningLeadMs,
  msUntilInactivityLogout,
  msUntilInactivityWarning,
} from "@/auth/sessionTiming";

const ACTIVITY_EVENTS = ["mousedown", "keydown", "touchstart", "scroll", "click"] as const;
const HEARTBEAT_INTERVAL_MS = 30_000;
const DEFAULT_TIMEOUT_MINUTES = 15;

export function useSessionTimeout({
  enabled,
  onExpire,
  initialLastActivityAt,
}: {
  enabled: boolean;
  onExpire: () => void | Promise<void>;
  initialLastActivityAt?: string | null;
}) {
  const { publicSettings } = usePublicSettings();
  const timeoutMinutes = publicSettings?.security.sessionTimeoutMinutes ?? DEFAULT_TIMEOUT_MINUTES;

  const [warningOpen, setWarningOpen] = useState(false);
  const [warningSecondsRemaining, setWarningSecondsRemaining] = useState(0);

  const lastActivityRef = useRef(Date.now());
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastHeartbeatRef = useRef(0);
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  const clearTimers = useCallback(() => {
    if (warningTimerRef.current) {
      clearTimeout(warningTimerRef.current);
      warningTimerRef.current = null;
    }
    if (logoutTimerRef.current) {
      clearTimeout(logoutTimerRef.current);
      logoutTimerRef.current = null;
    }
  }, []);

  const sendHeartbeat = useCallback(async () => {
    try {
      const result = await authApi.heartbeat();
      lastActivityRef.current = new Date(result.lastActivityAt).getTime();
      lastHeartbeatRef.current = Date.now();
    } catch {
      // Network or auth errors are handled elsewhere; do not force logout here.
    }
  }, []);

  const scheduleTimers = useCallback(() => {
    clearTimers();
    if (!enabled) return;

    const lastActivity = lastActivityRef.current;
    const warningDelay = msUntilInactivityWarning(timeoutMinutes, lastActivity);
    const logoutDelay = msUntilInactivityLogout(timeoutMinutes, lastActivity);
    const warningLeadMs = getWarningLeadMs(timeoutMinutes);

    warningTimerRef.current = setTimeout(() => {
      setWarningSecondsRemaining(Math.ceil(warningLeadMs / 1000));
      setWarningOpen(true);
    }, warningDelay);

    logoutTimerRef.current = setTimeout(() => {
      setWarningOpen(false);
      void onExpireRef.current();
    }, logoutDelay);
  }, [clearTimers, enabled, timeoutMinutes]);

  const recordActivity = useCallback(
    (syncServer = false) => {
      lastActivityRef.current = Date.now();
      setWarningOpen(false);
      scheduleTimers();

      if (!syncServer || !enabled) return;
      const now = Date.now();
      if (now - lastHeartbeatRef.current < HEARTBEAT_INTERVAL_MS) return;
      void sendHeartbeat();
    },
    [enabled, scheduleTimers, sendHeartbeat]
  );

  const staySignedIn = useCallback(() => {
    recordActivity(true);
    void sendHeartbeat();
  }, [recordActivity, sendHeartbeat]);

  useEffect(() => {
    if (!initialLastActivityAt) return;
    lastActivityRef.current = new Date(initialLastActivityAt).getTime();
    if (enabled) {
      scheduleTimers();
    }
  }, [enabled, initialLastActivityAt, scheduleTimers]);

  useEffect(() => {
    if (!enabled) {
      clearTimers();
      setWarningOpen(false);
      return;
    }

    if (!initialLastActivityAt) {
      recordActivity(false);
    }
    scheduleTimers();

    function handleActivity() {
      recordActivity(true);
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        recordActivity(true);
      }
    }

    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, handleActivity, { passive: true });
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    heartbeatTimerRef.current = setInterval(() => {
      if (document.visibilityState === "visible") {
        void sendHeartbeat();
      }
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      clearTimers();
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, handleActivity);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [clearTimers, enabled, recordActivity, scheduleTimers, sendHeartbeat, timeoutMinutes]);

  return {
    warningOpen,
    warningSecondsRemaining,
    staySignedIn,
    recordActivity,
  };
}
