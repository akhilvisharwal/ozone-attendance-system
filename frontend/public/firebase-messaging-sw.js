/* eslint-disable no-undef */
/**
 * Firebase Cloud Messaging service worker for Ozone Aircon.
 * Uses the Firebase compat SDK from CDN so the SW stays self-contained.
 * Config is injected via postMessage from the app after login.
 */

/* global importScripts, firebase, clients, self */

importScripts("https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js");

let messaging = null;
const shownIds = new Set();

function initFirebase(config) {
  if (!config?.apiKey || !config?.projectId || !config?.appId || !config?.messagingSenderId) {
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
    messaging.onBackgroundMessage((payload) => {
      const data = payload.data || {};
      const notificationId = data.notificationId;
      if (notificationId) {
        if (shownIds.has(notificationId)) return;
        shownIds.add(notificationId);
        if (shownIds.size > 100) {
          const first = shownIds.values().next().value;
          shownIds.delete(first);
        }
      }

      const title = data.title || (payload.notification && payload.notification.title) || "Ozone Aircon";
      const body = data.body || (payload.notification && payload.notification.body) || "";
      const linkPath = data.linkPath || "/";
      const sound = data.sound !== "0";
      const vibrate = data.vibrate !== "0";

      // Device default sound when silent is false — short/professional, not a custom ringtone.
      return self.registration.showNotification(title, {
        body,
        icon: "/android-chrome-192x192.png",
        badge: "/favicon-48x48.png",
        tag: notificationId ? `ozone-${notificationId}` : "ozone-push",
        renotify: false,
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

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "OZONE_FCM_CONFIG" && data.config) {
    initFirebase(data.config);
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const rawUrl = (event.notification.data && event.notification.data.url) || "/";
  const targetUrl = rawUrl.startsWith("http")
    ? rawUrl
    : new URL(rawUrl, self.location.origin).href;

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

// Attempt config bootstrap from the public API (no auth required).
fetch("/api/notifications/push/config")
  .then((res) => (res.ok ? res.json() : null))
  .then((payload) => {
    if (payload?.firebase) initFirebase(payload.firebase);
  })
  .catch(() => {
    // App will postMessage config after login.
  });
