import admin from "firebase-admin";
import { env } from "../../config/env";
import {
  claimPushDelivery,
  deleteTokens,
  getNotificationPreferences,
  isCategoryEnabled,
  listTokensForEmployees,
  mapNotificationTypeToCategory,
  releasePushDelivery,
} from "./push.repository";
import type { AppNotification } from "./notifications.repository";

let initialized = false;
let initAttempted = false;
let initProjectId: string | null = null;

function readServiceAccount(): admin.ServiceAccount | Record<string, unknown> | null {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (rawJson) {
    try {
      // Render/env paste sometimes wraps the whole JSON in extra quotes.
      const normalized =
        rawJson.startsWith('"') && rawJson.endsWith('"')
          ? (JSON.parse(rawJson) as string)
          : rawJson;
      const parsed = JSON.parse(normalized) as Record<string, unknown> & {
        private_key?: string;
        project_id?: string;
        projectId?: string;
        client_email?: string;
        clientEmail?: string;
      };
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
        credential: admin.credential.cert(account as admin.ServiceAccount),
      });
    }
    const record = account as { project_id?: string; projectId?: string; client_email?: string; clientEmail?: string };
    initProjectId = record.projectId || record.project_id || process.env.FIREBASE_PROJECT_ID || null;
    const clientEmail = record.clientEmail || record.client_email || "";
    initialized = true;
    console.info("[fcm] Firebase Admin SDK initialized", {
      projectId: initProjectId,
      clientEmail: clientEmail ? `${clientEmail.slice(0, 12)}…` : "(unknown)",
      via: process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim() ? "FIREBASE_SERVICE_ACCOUNT_JSON" : "split_env",
    });
    return true;
  } catch (err) {
    console.error("[fcm] Failed to initialize Firebase Admin:", err instanceof Error ? err.message : err);
    return false;
  }
}

export function getPublicFcmConfig() {
  const webProjectId = process.env.FIREBASE_PROJECT_ID?.trim() || "";
  return {
    configured: isFcmConfigured(),
    apiKey: process.env.FIREBASE_WEB_API_KEY?.trim() || "",
    authDomain: process.env.FIREBASE_WEB_AUTH_DOMAIN?.trim() || "",
    projectId: webProjectId,
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

function absoluteAsset(path: string): string {
  const base = env.appUrl.replace(/\/+$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export type SendPushResult = {
  tokenCount: number;
  successCount: number;
  failureCount: number;
  errors: Array<{ tokenSuffix: string; code: string; message: string }>;
};

async function sendToTokens(input: {
  tokens: string[];
  notification: AppNotification;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
}): Promise<SendPushResult> {
  const empty: SendPushResult = { tokenCount: 0, successCount: 0, failureCount: 0, errors: [] };
  if (input.tokens.length === 0) return empty;
  if (!ensureFirebase()) {
    console.error("[fcm] send aborted: Admin SDK not initialized");
    return empty;
  }

  const link = absoluteDeepLink(input.notification.link_path);
  const icon = absoluteAsset("/android-chrome-192x192.png");
  const badge = absoluteAsset("/favicon-48x48.png");
  const data: Record<string, string> = {
    notificationId: input.notification.id,
    type: input.notification.type,
    title: input.notification.title,
    body: input.notification.body ?? "",
    linkPath: input.notification.link_path ?? "/",
    sound: input.soundEnabled ? "1" : "0",
    vibrate: input.vibrationEnabled ? "1" : "0",
  };

  // notification + data: browser shows system tray alert (with default sound) in background;
  // foreground clients receive onMessage and must display locally.
  const message: admin.messaging.MulticastMessage = {
    tokens: input.tokens,
    notification: {
      title: input.notification.title,
      body: input.notification.body ?? undefined,
    },
    data,
    webpush: {
      headers: {
        Urgency: "high",
        TTL: "86400",
      },
      notification: {
        title: input.notification.title,
        body: input.notification.body ?? undefined,
        icon,
        badge,
        tag: `ozone-${input.notification.id}`,
        renotify: Boolean(input.soundEnabled),
        requireInteraction: false,
        silent: !input.soundEnabled,
        vibrate: input.vibrationEnabled ? [80, 40, 80] : undefined,
        data: { ...data, url: link ?? data.linkPath },
      },
      ...(link ? { fcmOptions: { link } } : {}),
    },
    android: {
      priority: "high",
      notification: {
        channelId: "ozone_default",
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

  console.info("[fcm] sending via HTTP v1 (sendEachForMulticast)", {
    notificationId: input.notification.id,
    type: input.notification.type,
    employeeId: input.notification.employee_id,
    tokenCount: input.tokens.length,
    tokenSuffixes: input.tokens.map((t) => t.slice(-12)),
    soundEnabled: input.soundEnabled,
    projectId: initProjectId,
    link,
  });

  try {
    const result = await admin.messaging().sendEachForMulticast(message);
    const stale: string[] = [];
    const errors: SendPushResult["errors"] = [];

    result.responses.forEach((response, index) => {
      const token = input.tokens[index];
      const tokenSuffix = token.slice(-12);
      if (response.success) {
        console.info("[fcm] Firebase response: success", {
          notificationId: input.notification.id,
          tokenSuffix,
          messageId: response.messageId,
        });
        return;
      }
      const code = response.error?.code ?? "unknown";
      const messageText = response.error?.message ?? code;
      console.error("[fcm] Firebase response: failure", {
        notificationId: input.notification.id,
        tokenSuffix,
        code,
        message: messageText,
      });
      errors.push({ tokenSuffix, code, message: messageText });
      if (
        code.includes("registration-token-not-registered") ||
        code.includes("invalid-registration-token") ||
        code.includes("messaging/registration-token-not-registered") ||
        code.includes("messaging/invalid-registration-token")
      ) {
        stale.push(token);
      }
    });

    if (stale.length > 0) {
      console.warn("[fcm] removing stale tokens", { count: stale.length });
      await deleteTokens(stale);
    }

    console.info("[fcm] multicast complete", {
      notificationId: input.notification.id,
      successCount: result.successCount,
      failureCount: result.failureCount,
    });

    return {
      tokenCount: input.tokens.length,
      successCount: result.successCount,
      failureCount: result.failureCount,
      errors,
    };
  } catch (err) {
    console.error("[fcm] Multicast send error:", err instanceof Error ? err.message : err);
    return {
      tokenCount: input.tokens.length,
      successCount: 0,
      failureCount: input.tokens.length,
      errors: [
        {
          tokenSuffix: "all",
          code: "multicast_exception",
          message: err instanceof Error ? err.message : String(err),
        },
      ],
    };
  }
}

/** Deliver an FCM push for an existing in-app notification (deduped by notification id). */
export async function deliverPushForNotification(notification: AppNotification): Promise<void> {
  if (!isFcmConfigured()) {
    console.info("[fcm] skip deliver: FCM not configured", { notificationId: notification.id });
    return;
  }

  const prefs = await getNotificationPreferences(notification.employee_id);
  const category = mapNotificationTypeToCategory(notification.type);
  if (!isCategoryEnabled(prefs, category)) {
    console.info("[fcm] skip deliver: category disabled by preferences", {
      notificationId: notification.id,
      category,
      type: notification.type,
    });
    return;
  }

  const tokens = await listTokensForEmployees([notification.employee_id]);
  if (tokens.length === 0) {
    console.info("[fcm] skip deliver: no device tokens for employee", {
      notificationId: notification.id,
      employeeId: notification.employee_id,
    });
    return;
  }

  const claimed = await claimPushDelivery(notification.id);
  if (!claimed) {
    console.info("[fcm] skip deliver: already claimed (dedupe)", { notificationId: notification.id });
    return;
  }

  console.info("[fcm] notification request claimed", {
    notificationId: notification.id,
    employeeId: notification.employee_id,
    type: notification.type,
    tokenCount: tokens.length,
  });

  const result = await sendToTokens({
    tokens: tokens.map((row) => row.token),
    notification,
    soundEnabled: prefs.soundEnabled,
    vibrationEnabled: prefs.vibrationEnabled,
  });

  if (result.successCount === 0) {
    // Allow a later retry if every attempt failed (e.g. transient FCM outage).
    await releasePushDelivery(notification.id);
    console.warn("[fcm] released delivery claim after total failure", {
      notificationId: notification.id,
      errors: result.errors,
    });
  }
}

export async function deliverPushForNotifications(notifications: AppNotification[]): Promise<void> {
  for (const notification of notifications) {
    await deliverPushForNotification(notification);
  }
}

/** Direct test send for the logged-in user — returns Firebase HTTP v1 results. */
export async function sendTestPushToEmployee(employeeId: string): Promise<{
  configured: boolean;
  initialized: boolean;
  projectId: string | null;
  tokensFound: number;
  result: SendPushResult | null;
  notificationId: string | null;
}> {
  const configured = isFcmConfigured();
  const initializedOk = configured ? ensureFirebase() : false;
  const tokens = await listTokensForEmployees([employeeId]);

  console.info("[fcm] test push requested", {
    employeeId,
    configured,
    initialized: initializedOk,
    projectId: initProjectId,
    tokensFound: tokens.length,
    tokenSuffixes: tokens.map((t) => t.token.slice(-12)),
  });

  if (!configured || !initializedOk || tokens.length === 0) {
    return {
      configured,
      initialized: initializedOk,
      projectId: initProjectId,
      tokensFound: tokens.length,
      result: null,
      notificationId: null,
    };
  }

  const prefs = await getNotificationPreferences(employeeId);
  const now = new Date().toISOString();
  const notification: AppNotification = {
    id: `test-${employeeId.slice(0, 8)}-${Date.now()}`,
    employee_id: employeeId,
    type: "security_test_push",
    title: "Ozone test notification",
    body: `Push delivery check at ${now}. If you hear a sound, FCM is working.`,
    link_path: "/profile",
    entity_id: null,
    read_at: null,
    created_at: now,
  };

  // Test ids are not real app_notifications rows — skip claim/FK log.
  const result = await sendToTokens({
    tokens: tokens.map((row) => row.token),
    notification,
    soundEnabled: prefs.soundEnabled,
    vibrationEnabled: prefs.vibrationEnabled,
  });

  return {
    configured,
    initialized: initializedOk,
    projectId: initProjectId,
    tokensFound: tokens.length,
    result,
    notificationId: notification.id,
  };
}

export function getFcmRuntimeStatus() {
  const configured = isFcmConfigured();
  if (configured) {
    ensureFirebase();
  }
  return {
    configured,
    initialized,
    projectId: initProjectId,
    webProjectId: process.env.FIREBASE_PROJECT_ID?.trim() || null,
  };
}
