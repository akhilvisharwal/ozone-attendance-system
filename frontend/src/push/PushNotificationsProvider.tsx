import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import * as pushApi from "@/api/push";
import type { PushPreferences } from "@/api/push";
import {
  disablePushNotifications,
  enablePushNotifications,
  getStoredPushToken,
} from "@/lib/pushNotifications";
import { useToast } from "@/components/ui/Toast";

interface PushContextValue {
  configured: boolean;
  permission: NotificationPermission | "unsupported";
  pushEnabled: boolean;
  preferences: PushPreferences | null;
  loading: boolean;
  refreshing: boolean;
  enablePush: () => Promise<boolean>;
  disablePush: () => Promise<void>;
  refreshPreferences: () => Promise<void>;
  savePreferences: (prefs: Omit<PushPreferences, "securityAlerts" | "updatedAt">) => Promise<void>;
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
          return;
        }

        await refreshPreferences();
        if (cancelled) return;

        if (config.configured && Notification.permission === "granted") {
          const result = await enablePushNotifications((payload) => {
            showToast(payload.title);
            // Soft foreground banner via toast; OS sound only when a Notification is shown.
            if (document.visibilityState !== "visible") {
              void new Notification(payload.title, {
                body: payload.body,
                icon: "/android-chrome-192x192.png",
                tag: payload.notificationId ? `ozone-${payload.notificationId}` : undefined,
                silent: !payload.sound,
                // Short soft vibration pattern — not continuous.
                vibrate: payload.vibrate ? [80, 40, 80] : undefined,
                data: { url: payload.linkPath },
              } as NotificationOptions);
            }
          });
          if (!cancelled) {
            setPushEnabled(result.enabled);
            if ("Notification" in window) setPermission(Notification.permission);
          }
        } else {
          setPushEnabled(Boolean(getStoredPushToken()) && Notification.permission === "granted");
        }
      } catch {
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
  }, [employee, isBootstrapping, refreshPreferences, showToast]);

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
    }
    return result.enabled;
  }, [showToast]);

  const disablePush = useCallback(async () => {
    await disablePushNotifications();
    setPushEnabled(false);
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

  const value = useMemo(
    () => ({
      configured,
      permission,
      pushEnabled,
      preferences: preferences ?? (employee ? DEFAULT_PREFS : null),
      loading,
      refreshing,
      enablePush,
      disablePush,
      refreshPreferences,
      savePreferences,
    }),
    [
      configured,
      permission,
      pushEnabled,
      preferences,
      employee,
      loading,
      refreshing,
      enablePush,
      disablePush,
      refreshPreferences,
      savePreferences,
    ]
  );

  return <PushContext.Provider value={value}>{children}</PushContext.Provider>;
}

export function usePushNotifications() {
  const ctx = useContext(PushContext);
  if (!ctx) throw new Error("usePushNotifications must be used within PushNotificationsProvider");
  return ctx;
}
