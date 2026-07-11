/* eslint-disable no-undef */
/**
 * Firebase Cloud Messaging service worker for Ozone Aircon.
 * Uses the Firebase compat SDK from CDN so the SW stays self-contained.
 * Config is injected via postMessage from the app after login, and also
 * bootstrapped from the public /api/notifications/push/config endpoint.
 */

/* global importScripts, firebase, clients, self */

importScripts("https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js");

let messaging = null;
let initializedProjectId = null;
const shownIds = new Set();

function initFirebase(config) {
  if (!config?.apiKey || !config?.projectId || !config?.appId || !config?.messagingSenderId) {
    console.warn("[fcm-sw] incomplete config, skip init", {
      hasApiKey: Boolean(config?.apiKey),
      hasProjectId: Boolean(config?.projectId),
    });
    return;
  }
  if (initializedProjectId === config.projectId && messaging) {
    return;
  }
  try {
    if (!firebase.apps.length) {
      firebase.initializeApp({
        apiKey: config.apiKey,
        authDomain: config.authDomain || undefined,
        projectId: config.projectId,
        messagingSenderId: config.messagingSenderId,
        appId: config.appId,
      });
    }
    messaging = firebase.messaging();
    initializedProjectId = config.projectId;
    console.info("[fcm-sw] Firebase messaging ready", { projectId: config.projectId });

    messaging.onBackgroundMessage((payload) => {
      const data = payload.data || {};
      const notificationId = data.notificationId;
      console.info("[fcm-sw] background message", {
        notificationId,
        title: data.title || payload.notification?.title,
        hasNotificationPayload: Boolean(payload.notification),
      });

      // When FCM includes a notification payload, the browser already displays it
      // with the device default sound. Only show manually for data-only messages.
      if (payload.notification && payload.notification.title) {
        console.info("[fcm-sw] browser/system will display notification payload");
        return;
      }

      if (notificationId) {
        if (shownIds.has(notificationId)) return;
        shownIds.add(notificationId);
        if (shownIds.size > 100) {
          const first = shownIds.values().next().value;
          shownIds.delete(first);
        }
      }

      const title = data.title || "Ozone Aircon";
      const body = data.body || "";
      const linkPath = data.linkPath || "/";
      const sound = data.sound !== "0";
      const vibrate = data.vibrate !== "0";

      console.info("[fcm-sw] showing data-only notification", { title, sound });
      return self.registration.showNotification(title, {
        body,
        icon: "/android-chrome-192x192.png",
        badge: "/favicon-48x48.png",
        tag: notificationId ? `ozone-${notificationId}` : "ozone-push",
        renotify: sound,
        requireInteraction: false,
        silent: !sound,
        vibrate: vibrate ? [80, 40, 80] : undefined,
        data: { url: linkPath, notificationId },
      });
    });
  } catch (err) {
    console.error("[fcm-sw] init failed", err);
  }
}

self.addEventListener("install", (event) => {
  console.info("[fcm-sw] install");
  self.skipWaiting();
  event.waitUntil(Promise.resolve());
});

self.addEventListener("activate", (event) => {
  console.info("[fcm-sw] activate");
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "OZONE_FCM_CONFIG" && data.config) {
    console.info("[fcm-sw] received config via postMessage");
    initFirebase(data.config);
  }
  if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const rawUrl = (event.notification.data && event.notification.data.url) || "/";
  const targetUrl = rawUrl.startsWith("http")
    ? rawUrl
    : new URL(rawUrl, self.location.origin).href;

  console.info("[fcm-sw] notification click", { rawUrl, targetUrl });
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.postMessage({ type: "OZONE_NOTIFICATION_NAVIGATE", url: rawUrl });
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});

// Bootstrap Firebase in the SW even before the page posts config (needed after SW restart).
fetch(self.location.origin + "/api/notifications/push/config")
  .then((res) => {
    console.info("[fcm-sw] config fetch status", res.status);
    return res.ok ? res.json() : null;
  })
  .then((payload) => {
    if (payload?.firebase) initFirebase(payload.firebase);
  })
  .catch((err) => {
    console.warn("[fcm-sw] config bootstrap failed (app will postMessage later)", err);
  });
