import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getMessaging,
  getToken,
  isSupported,
  onMessage,
  type Messaging,
  type Unsubscribe,
} from "firebase/messaging";
import * as pushApi from "@/api/push";
import type { FirebaseWebConfig } from "@/api/push";

const TOKEN_STORAGE_KEY = "ozone.fcm.token";
const SHOWN_IDS_KEY = "ozone.fcm.shownIds";

let app: FirebaseApp | null = null;
let messaging: Messaging | null = null;
let foregroundUnsub: Unsubscribe | null = null;

function rememberShown(notificationId: string): boolean {
  try {
    const raw = sessionStorage.getItem(SHOWN_IDS_KEY);
    const ids: string[] = raw ? (JSON.parse(raw) as string[]) : [];
    if (ids.includes(notificationId)) return false;
    const next = [...ids, notificationId].slice(-80);
    sessionStorage.setItem(SHOWN_IDS_KEY, JSON.stringify(next));
    return true;
  } catch {
    return true;
  }
}

async function ensureMessaging(config: FirebaseWebConfig): Promise<Messaging | null> {
  const supported = await isSupported().catch(() => false);
  if (!supported) return null;
  if (!config.apiKey || !config.projectId || !config.appId || !config.messagingSenderId) {
    return null;
  }

  if (!app) {
    app =
      getApps()[0] ??
      initializeApp({
        apiKey: config.apiKey,
        authDomain: config.authDomain || undefined,
        projectId: config.projectId,
        messagingSenderId: config.messagingSenderId,
        appId: config.appId,
      });
  }

  if (!messaging) {
    messaging = getMessaging(app);
  }
  return messaging;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/firebase-messaging-sw.js", {
      scope: "/",
    });
  } catch (err) {
    console.error("[fcm] Service worker registration failed:", err);
    return null;
  }
}

export type ForegroundHandler = (payload: {
  notificationId?: string;
  title: string;
  body: string;
  linkPath: string;
  sound: boolean;
  vibrate: boolean;
}) => void;

export async function enablePushNotifications(onForeground?: ForegroundHandler): Promise<{
  enabled: boolean;
  token: string | null;
  reason?: string;
}> {
  const configRes = await pushApi.fetchPushConfig();
  if (!configRes.configured) {
    return { enabled: false, token: null, reason: "Push notifications are not configured on the server." };
  }

  if (!("Notification" in window)) {
    return { enabled: false, token: null, reason: "This browser does not support notifications." };
  }

  const permission =
    Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();

  if (permission !== "granted") {
    return { enabled: false, token: null, reason: "Notification permission was not granted." };
  }

  const registration = await registerServiceWorker();
  if (!registration) {
    return { enabled: false, token: null, reason: "Could not register the notification service worker." };
  }

  // Pass web config to the service worker for background handling.
  registration.active?.postMessage({ type: "OZONE_FCM_CONFIG", config: configRes.firebase });
  navigator.serviceWorker.controller?.postMessage({
    type: "OZONE_FCM_CONFIG",
    config: configRes.firebase,
  });

  const msg = await ensureMessaging(configRes.firebase);
  if (!msg) {
    return { enabled: false, token: null, reason: "Firebase Messaging is not supported in this browser." };
  }

  const token = await getToken(msg, {
    vapidKey: configRes.firebase.vapidKey,
    serviceWorkerRegistration: registration,
  });

  if (!token) {
    return { enabled: false, token: null, reason: "Could not obtain a push token." };
  }

  await pushApi.registerPushDevice(token, "web");
  localStorage.setItem(TOKEN_STORAGE_KEY, token);

  if (foregroundUnsub) {
    foregroundUnsub();
    foregroundUnsub = null;
  }

  foregroundUnsub = onMessage(msg, (payload) => {
    const data = payload.data ?? {};
    const notificationId = data.notificationId;
    if (notificationId && !rememberShown(notificationId)) return;

    const title = data.title || payload.notification?.title || "Ozone Aircon";
    const body = data.body || payload.notification?.body || "";
    const linkPath = data.linkPath || "/";
    const sound = data.sound !== "0";
    const vibrate = data.vibrate !== "0";

    if (onForeground) {
      onForeground({ notificationId, title, body, linkPath, sound, vibrate });
      return;
    }

    // Soft default OS notification — never a custom ringtone.
    void registration.showNotification(title, {
      body,
      icon: "/android-chrome-192x192.png",
      badge: "/favicon-48x48.png",
      tag: notificationId ? `ozone-${notificationId}` : undefined,
      renotify: false,
      silent: !sound,
      vibrate: vibrate ? [80, 40, 80] : undefined,
      data: { url: linkPath, notificationId },
    } as NotificationOptions);
  });

  return { enabled: true, token };
}

export async function disablePushNotifications(): Promise<void> {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (token) {
    try {
      await pushApi.unregisterPushDevice(token);
    } catch {
      // Ignore network errors on logout/unregister.
    }
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
  if (foregroundUnsub) {
    foregroundUnsub();
    foregroundUnsub = null;
  }
}

export function getStoredPushToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}
