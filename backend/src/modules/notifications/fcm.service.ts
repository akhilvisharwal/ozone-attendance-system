import admin from "firebase-admin";
import { env } from "../../config/env";
import {
  claimPushDelivery,
  deleteTokens,
  getNotificationPreferences,
  isCategoryEnabled,
  listTokensForEmployees,
  mapNotificationTypeToCategory,
} from "./push.repository";
import type { AppNotification } from "./notifications.repository";

let initialized = false;
let initAttempted = false;

function readServiceAccount(): admin.ServiceAccount | null {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson) as admin.ServiceAccount & { private_key?: string };
      if (parsed.private_key) {
        parsed.private_key = String(parsed.private_key).replace(/\\n/g, "\n");
      }
      return parsed;
    } catch (err) {
      console.error(
        "[fcm] FIREBASE_SERVICE_ACCOUNT_JSON is invalid JSON:",
        err instanceof Error ? err.message : err
      );
      return null;
    }
  }

  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.trim()?.replace(/\\n/g, "\n");
  if (projectId && clientEmail && privateKey) {
    return { projectId, clientEmail, privateKey };
  }
  return null;
}

export function isFcmConfigured(): boolean {
  return Boolean(readServiceAccount());
}

function ensureFirebase(): boolean {
  if (initialized) return true;
  if (initAttempted) return false;
  initAttempted = true;

  const account = readServiceAccount();
  if (!account) {
    console.warn(
      "[fcm] Firebase is not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY to enable push notifications."
    );
    return false;
  }

  try {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(account),
      });
    }
    initialized = true;
    return true;
  } catch (err) {
    console.error("[fcm] Failed to initialize Firebase Admin:", err instanceof Error ? err.message : err);
    return false;
  }
}

export function getPublicFcmConfig() {
  return {
    configured: isFcmConfigured(),
    apiKey: process.env.FIREBASE_WEB_API_KEY?.trim() || "",
    authDomain: process.env.FIREBASE_WEB_AUTH_DOMAIN?.trim() || "",
    projectId: process.env.FIREBASE_PROJECT_ID?.trim() || "",
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID?.trim() || "",
    appId: process.env.FIREBASE_WEB_APP_ID?.trim() || "",
    vapidKey: process.env.FIREBASE_VAPID_KEY?.trim() || "",
  };
}

function absoluteDeepLink(linkPath: string | null | undefined): string | undefined {
  if (!linkPath?.trim()) return undefined;
  const path = linkPath.startsWith("/") ? linkPath : `/${linkPath}`;
  return `${env.appUrl}${path}`;
}

async function sendToTokens(input: {
  tokens: string[];
  notification: AppNotification;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
}): Promise<void> {
  if (input.tokens.length === 0) return;
  if (!ensureFirebase()) return;

  const link = absoluteDeepLink(input.notification.link_path);
  const data: Record<string, string> = {
    notificationId: input.notification.id,
    type: input.notification.type,
    title: input.notification.title,
    body: input.notification.body ?? "",
    linkPath: input.notification.link_path ?? "/",
    sound: input.soundEnabled ? "1" : "0",
    vibrate: input.vibrationEnabled ? "1" : "0",
  };

  // Use notification + data so background/PWA shows a system notification with the
  // device default sound. `tag` prevents duplicate OS banners for the same id.
  const message: admin.messaging.MulticastMessage = {
    tokens: input.tokens,
    notification: {
      title: input.notification.title,
      body: input.notification.body ?? undefined,
    },
    data,
    webpush: {
      headers: {
        Urgency: "normal",
        TTL: "3600",
      },
      notification: {
        title: input.notification.title,
        body: input.notification.body ?? undefined,
        icon: "/android-chrome-192x192.png",
        badge: "/favicon-48x48.png",
        tag: `ozone-${input.notification.id}`,
        renotify: false,
        requireInteraction: false,
        silent: !input.soundEnabled,
        ...(link ? { data: { ...data, url: link } } : { data }),
      },
      ...(link ? { fcmOptions: { link } } : {}),
    },
    android: {
      priority: "high",
      notification: {
        channelId: "ozone_default",
        // Device default notification sound — short/soft, not a custom ringtone.
        sound: input.soundEnabled ? "default" : undefined,
        defaultSound: input.soundEnabled,
        defaultVibrateTimings: input.vibrationEnabled,
        tag: `ozone-${input.notification.id}`,
        ...(link ? { clickAction: link } : {}),
      },
    },
    apns: {
      payload: {
        aps: {
          sound: input.soundEnabled ? "default" : undefined,
          "thread-id": input.notification.type,
        },
      },
    },
  };

  try {
    const result = await admin.messaging().sendEachForMulticast(message);
    const stale: string[] = [];
    result.responses.forEach((response, index) => {
      if (response.success) return;
      const code = response.error?.code ?? "";
      if (
        code.includes("registration-token-not-registered") ||
        code.includes("invalid-registration-token")
      ) {
        stale.push(input.tokens[index]);
      } else {
        console.error("[fcm] Send failed:", response.error?.message ?? code);
      }
    });
    if (stale.length > 0) {
      await deleteTokens(stale);
    }
  } catch (err) {
    console.error("[fcm] Multicast send error:", err instanceof Error ? err.message : err);
  }
}

/** Deliver an FCM push for an existing in-app notification (deduped by notification id). */
export async function deliverPushForNotification(notification: AppNotification): Promise<void> {
  if (!isFcmConfigured()) return;

  const claimed = await claimPushDelivery(notification.id);
  if (!claimed) return;

  const prefs = await getNotificationPreferences(notification.employee_id);
  const category = mapNotificationTypeToCategory(notification.type);
  if (!isCategoryEnabled(prefs, category)) return;

  const tokens = await listTokensForEmployees([notification.employee_id]);
  if (tokens.length === 0) return;

  await sendToTokens({
    tokens: tokens.map((row) => row.token),
    notification,
    soundEnabled: prefs.soundEnabled,
    vibrationEnabled: prefs.vibrationEnabled,
  });
}

export async function deliverPushForNotifications(notifications: AppNotification[]): Promise<void> {
  for (const notification of notifications) {
    // Sequential to keep preference lookups simple and avoid stampeding FCM.
    await deliverPushForNotification(notification);
  }
}
