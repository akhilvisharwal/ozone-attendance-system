import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import * as pushApi from "@/api/push";
import type { PushPreferences, PushStatus } from "@/api/push";
import {
  disablePushNotifications,
  enablePushNotifications,
  getStoredPushToken,
} from "@/lib/pushNotifications";
import { extractErrorMessage } from "@/api/client";
import { useToast } from "@/components/ui/Toast";

interface PushContextValue {
  configured: boolean;
  permission: NotificationPermission | "unsupported";
  pushEnabled: boolean;
  preferences: PushPreferences | null;
  status: PushStatus | null;
  loading: boolean;
  refreshing: boolean;
  enablePush: () => Promise<boolean>;
  disablePush: () => Promise<void>;
  refreshPreferences: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  savePreferences: (prefs: Omit<PushPreferences, "securityAlerts" | "updatedAt">) => Promise<void>;
  sendTestPush: () => Promise<boolean>;
}

const PushContext = createContext<PushContextValue | undefined>(undefined);

const DEFAULT_PREFS: PushPreferences = {
  soundEnabled: true,
  vibrationEnabled: true,
  attendanceReminders: true,
  taskNotifications: true,
  leaveNotifications: true,
  expenseNotifications: true,
  securityAlerts: true,
  updatedAt: null,
};

export function PushNotificationsProvider({ children }: { children: ReactNode }) {
  const { employee, isBootstrapping } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [configured, setConfigured] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [pushEnabled, setPushEnabled] = useState(false);
  const [preferences, setPreferences] = useState<PushPreferences | null>(null);
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const refreshPreferences = useCallback(async () => {
    if (!employee) {
      setPreferences(null);
      return;
    }
    const prefs = await pushApi.fetchPushPreferences();
    setPreferences(prefs);
  }, [employee]);

  const refreshStatus = useCallback(async () => {
    if (!employee) {
      setStatus(null);
      return;
    }
    try {
      const next = await pushApi.fetchPushStatus();
      setStatus(next);
      setPushEnabled(next.deviceCount > 0 && Notification.permission === "granted");
    } catch (err) {
      console.warn("[fcm] status refresh failed", err);
    }
  }, [employee]);

  useEffect(() => {
    if (!("Notification" in window)) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission);
  }, []);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const data = event.data as { type?: string; url?: string } | undefined;
      if (data?.type === "OZONE_NOTIFICATION_NAVIGATE" && data.url) {
        const path = data.url.startsWith("http")
          ? new URL(data.url).pathname + new URL(data.url).search
          : data.url;
        navigate(path);
      }
    }
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => navigator.serviceWorker?.removeEventListener("message", onMessage);
  }, [navigate]);

  useEffect(() => {
    if (isBootstrapping) return;
    let cancelled = false;

    void (async () => {
      setLoading(true);
      try {
        const config = await pushApi.fetchPushConfig();
        if (cancelled) return;
        setConfigured(config.configured);

        if (!employee) {
          setPushEnabled(false);
          setPreferences(null);
          setStatus(null);
          return;
        }

        await refreshPreferences();
        if (cancelled) return;

        if (config.configured && Notification.permission === "granted") {
          const result = await enablePushNotifications((payload) => {
            // OS notification + sound are handled inside enablePushNotifications.
            showToast(payload.title);
          });
          if (!cancelled) {
            setPushEnabled(result.enabled);
            if ("Notification" in window) setPermission(Notification.permission);
            await refreshStatus();
          }
        } else {
          setPushEnabled(Boolean(getStoredPushToken()) && Notification.permission === "granted");
          await refreshStatus();
        }
      } catch (err) {
        console.error("[fcm] provider bootstrap failed", err);
        if (!cancelled) {
          setConfigured(false);
          setPushEnabled(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [employee, isBootstrapping, refreshPreferences, refreshStatus, showToast]);

  const enablePush = useCallback(async () => {
    const result = await enablePushNotifications((payload) => {
      showToast(payload.title);
    });
    if ("Notification" in window) setPermission(Notification.permission);
    setPushEnabled(result.enabled);
    if (!result.enabled && result.reason) {
      showToast(result.reason);
    } else if (result.enabled) {
      showToast("Push notifications enabled.");
      await refreshStatus();
    }
    return result.enabled;
  }, [refreshStatus, showToast]);

  const disablePush = useCallback(async () => {
    await disablePushNotifications();
    setPushEnabled(false);
    setStatus((prev) => (prev ? { ...prev, deviceCount: 0, devices: [] } : prev));
    showToast("Push notifications disabled on this device.");
  }, [showToast]);

  const savePreferences = useCallback(
    async (prefs: Omit<PushPreferences, "securityAlerts" | "updatedAt">) => {
      setRefreshing(true);
      try {
        const updated = await pushApi.updatePushPreferences(prefs);
        setPreferences(updated);
        showToast("Notification preferences saved.");
      } finally {
        setRefreshing(false);
      }
    },
    [showToast]
  );

  const sendTestPush = useCallback(async () => {
    setRefreshing(true);
    try {
      const outcome = await pushApi.sendTestPush();
      console.info("[fcm] test push result", outcome);
      if (outcome.ok) {
        showToast("Test notification sent — check sound and tray.");
      } else {
        const firstError = outcome.result?.errors?.[0]?.message;
        showToast(firstError || "Test notification failed. Check console / server logs.");
      }
      await refreshStatus();
      return outcome.ok;
    } catch (err) {
      console.error("[fcm] test push error", err);
      showToast(extractErrorMessage(err, "Test notification failed."));
      return false;
    } finally {
      setRefreshing(false);
    }
  }, [refreshStatus, showToast]);

  const value = useMemo(
    () => ({
      configured,
      permission,
      pushEnabled,
      preferences: preferences ?? (employee ? DEFAULT_PREFS : null),
      status,
      loading,
      refreshing,
      enablePush,
      disablePush,
      refreshPreferences,
      refreshStatus,
      savePreferences,
      sendTestPush,
    }),
    [
      configured,
      permission,
      pushEnabled,
      preferences,
      status,
      employee,
      loading,
      refreshing,
      enablePush,
      disablePush,
      refreshPreferences,
      refreshStatus,
      savePreferences,
      sendTestPush,
    ]
  );

  return <PushContext.Provider value={value}>{children}</PushContext.Provider>;
}

export function usePushNotifications() {
  const ctx = useContext(PushContext);
  if (!ctx) throw new Error("usePushNotifications must be used within PushNotificationsProvider");
  return ctx;
}
