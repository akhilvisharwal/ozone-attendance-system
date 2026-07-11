import { apiClient, getApiBasePath } from "./client";

export type PushPreferences = {
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  attendanceReminders: boolean;
  taskNotifications: boolean;
  leaveNotifications: boolean;
  expenseNotifications: boolean;
  securityAlerts: true;
  updatedAt?: string | null;
};

export type FirebaseWebConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  messagingSenderId: string;
  appId: string;
  vapidKey: string;
};

export async function fetchPushConfig() {
  const res = await apiClient.get<{
    configured: boolean;
    firebase: FirebaseWebConfig;
  }>("/notifications/push/config");
  return res.data;
}

/** Unauthenticated fetch for the service worker (same payload). */
export async function fetchPushConfigPublic(): Promise<{
  configured: boolean;
  firebase: FirebaseWebConfig;
}> {
  const res = await fetch(`${getApiBasePath()}/notifications/push/config`, {
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error("Failed to load push config");
  }
  return res.json() as Promise<{ configured: boolean; firebase: FirebaseWebConfig }>;
}

export async function registerPushDevice(token: string, platform: "web" | "android" | "ios" = "web") {
  const res = await apiClient.post<{ id: string }>("/notifications/push/devices", { token, platform });
  return res.data;
}

export async function unregisterPushDevice(token: string) {
  await apiClient.delete("/notifications/push/devices", { data: { token } });
}

export async function fetchPushPreferences() {
  const res = await apiClient.get<{ preferences: PushPreferences }>("/notifications/push/preferences");
  return res.data.preferences;
}

export async function updatePushPreferences(
  preferences: Omit<PushPreferences, "securityAlerts" | "updatedAt">
) {
  const res = await apiClient.put<{ preferences: PushPreferences }>(
    "/notifications/push/preferences",
    preferences
  );
  return res.data.preferences;
}

export type PushStatus = {
  configured: boolean;
  initialized: boolean;
  projectId: string | null;
  webProjectId: string | null;
  deviceCount: number;
  devices: Array<{
    id: string;
    platform: string;
    tokenSuffix: string;
    lastSeenAt: string;
    createdAt: string;
  }>;
  preferences: PushPreferences;
};

export async function fetchPushStatus() {
  const res = await apiClient.get<PushStatus>("/notifications/push/status");
  return res.data;
}

export type TestPushResult = {
  ok: boolean;
  configured: boolean;
  initialized: boolean;
  projectId: string | null;
  tokensFound: number;
  notificationId: string | null;
  result: {
    tokenCount: number;
    successCount: number;
    failureCount: number;
    errors: Array<{ tokenSuffix: string; code: string; message: string }>;
  } | null;
};

export async function sendTestPush() {
  const res = await apiClient.post<TestPushResult>("/notifications/push/test");
  return res.data;
}
