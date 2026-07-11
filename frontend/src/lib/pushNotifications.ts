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
  if (!supported) {
    console.warn("[fcm] Messaging.isSupported() returned false");
    return null;
  }
  if (!config.apiKey || !config.projectId || !config.appId || !config.messagingSenderId) {
    console.warn("[fcm] Incomplete Firebase web config", {
      hasApiKey: Boolean(config.apiKey),
      hasProjectId: Boolean(config.projectId),
      hasAppId: Boolean(config.appId),
      hasSenderId: Boolean(config.messagingSenderId),
    });
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
    console.info("[fcm] Firebase app initialized", { projectId: config.projectId });
  }

  if (!messaging) {
    messaging = getMessaging(app);
  }
  return messaging;
}

function postConfigToWorker(registration: ServiceWorkerRegistration, config: FirebaseWebConfig) {
  const message = { type: "OZONE_FCM_CONFIG", config };
  registration.active?.postMessage(message);
  registration.waiting?.postMessage(message);
  registration.installing?.postMessage(message);
  navigator.serviceWorker.controller?.postMessage(message);
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) {
    console.warn("[fcm] serviceWorker not available in this browser");
    return null;
  }
  try {
    await navigator.serviceWorker.register("/firebase-messaging-sw.js", {
      scope: "/",
    });
    const ready = await navigator.serviceWorker.ready;
    console.info("[fcm] service worker registered and ready", {
      scope: ready.scope,
      active: Boolean(ready.active),
      scriptURL: ready.active?.scriptURL ?? null,
      controller: Boolean(navigator.serviceWorker.controller),
    });
    return ready;
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

async function showLocalNotification(
  registration: ServiceWorkerRegistration,
  input: {
    notificationId?: string;
    title: string;
    body: string;
    linkPath: string;
    sound: boolean;
    vibrate: boolean;
  }
) {
  console.info("[fcm] showing local/OS notification", {
    title: input.title,
    sound: input.sound,
    visibility: document.visibilityState,
  });
  await registration.showNotification(input.title, {
    body: input.body,
    icon: "/android-chrome-192x192.png",
    badge: "/favicon-48x48.png",
    tag: input.notificationId ? `ozone-${input.notificationId}` : `ozone-${Date.now()}`,
    renotify: input.sound,
    requireInteraction: false,
    silent: !input.sound,
    vibrate: input.vibrate ? [80, 40, 80] : undefined,
    data: { url: input.linkPath, notificationId: input.notificationId },
  } as NotificationOptions);
}

export async function enablePushNotifications(onForeground?: ForegroundHandler): Promise<{
  enabled: boolean;
  token: string | null;
  reason?: string;
}> {
  console.info("[fcm] enablePushNotifications: start");
  const configRes = await pushApi.fetchPushConfig();
  console.info("[fcm] push config loaded", {
    configured: configRes.configured,
    projectId: configRes.firebase.projectId,
    hasVapid: Boolean(configRes.firebase.vapidKey),
  });
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

  console.info("[fcm] notification permission", { permission });
  if (permission !== "granted") {
    return { enabled: false, token: null, reason: "Notification permission was not granted." };
  }

  const registration = await registerServiceWorker();
  if (!registration) {
    return { enabled: false, token: null, reason: "Could not register the notification service worker." };
  }

  postConfigToWorker(registration, configRes.firebase);

  const msg = await ensureMessaging(configRes.firebase);
  if (!msg) {
    return { enabled: false, token: null, reason: "Firebase Messaging is not supported in this browser." };
  }

  console.info("[fcm] requesting FCM token via getToken…");
  let token: string;
  try {
    token = await getToken(msg, {
      vapidKey: configRes.firebase.vapidKey,
      serviceWorkerRegistration: registration,
    });
  } catch (err) {
    console.error("[fcm] getToken failed:", err);
    return {
      enabled: false,
      token: null,
      reason: err instanceof Error ? err.message : "Could not obtain a push token.",
    };
  }

  if (!token) {
    console.error("[fcm] getToken returned empty token");
    return { enabled: false, token: null, reason: "Could not obtain a push token." };
  }

  console.info("[fcm] token generated", { tokenSuffix: token.slice(-12), length: token.length });

  try {
    const saved = await pushApi.registerPushDevice(token, "web");
    console.info("[fcm] token saved on server", saved);
  } catch (err) {
    console.error("[fcm] token save failed:", err);
    return {
      enabled: false,
      token: null,
      reason: "Could not save the push token on the server.",
    };
  }

  localStorage.setItem(TOKEN_STORAGE_KEY, token);

  if (foregroundUnsub) {
    foregroundUnsub();
    foregroundUnsub = null;
  }

  foregroundUnsub = onMessage(msg, (payload) => {
    const data = payload.data ?? {};
    const notificationId = data.notificationId;
    if (notificationId && !rememberShown(notificationId)) {
      console.info("[fcm] foreground duplicate suppressed", { notificationId });
      return;
    }

    const title = data.title || payload.notification?.title || "Ozone Aircon";
    const body = data.body || payload.notification?.body || "";
    const linkPath = data.linkPath || "/";
    const sound = data.sound !== "0";
    const vibrate = data.vibrate !== "0";

    console.info("[fcm] foreground message received", {
      notificationId,
      title,
      sound,
      hasNotificationPayload: Boolean(payload.notification),
    });

    // Always show an OS notification while the app is open so the device default sound plays.
    void showLocalNotification(registration, {
      notificationId,
      title,
      body,
      linkPath,
      sound,
      vibrate,
    });

    onForeground?.({ notificationId, title, body, linkPath, sound, vibrate });
  });

  console.info("[fcm] enablePushNotifications: success");
  return { enabled: true, token };
}

export async function disablePushNotifications(): Promise<void> {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (token) {
    try {
      await pushApi.unregisterPushDevice(token);
      console.info("[fcm] device unregistered", { tokenSuffix: token.slice(-12) });
    } catch (err) {
      console.warn("[fcm] unregister failed (ignored):", err);
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

export async function getServiceWorkerDebugInfo(): Promise<{
  supported: boolean;
  controller: boolean;
  scriptURL: string | null;
  state: string | null;
}> {
  if (!("serviceWorker" in navigator)) {
    return { supported: false, controller: false, scriptURL: null, state: null };
  }
  const ready = await navigator.serviceWorker.getRegistration("/");
  return {
    supported: true,
    controller: Boolean(navigator.serviceWorker.controller),
    scriptURL: ready?.active?.scriptURL ?? null,
    state: ready?.active?.state ?? null,
  };
}
