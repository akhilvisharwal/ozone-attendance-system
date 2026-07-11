import { z } from "zod";
import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/errors";
import * as repo from "./notifications.repository";
import * as pushRepo from "./push.repository";
import {
  getFcmRuntimeStatus,
  getPublicFcmConfig,
  isFcmConfigured,
  sendTestPushToEmployee,
} from "./fcm.service";

export const listMyNotifications = asyncHandler(async (req: Request, res: Response) => {
  const notifications = await repo.listMyNotifications(req.user!.id);
  res.json({ notifications });
});

export const getUnreadCount = asyncHandler(async (req: Request, res: Response) => {
  const count = await repo.countUnread(req.user!.id);
  res.json({ count });
});

export const markNotificationRead = asyncHandler(async (req: Request, res: Response) => {
  const updated = await repo.markRead(req.params.id, req.user!.id);
  if (!updated) throw ApiError.notFound("Notification not found");
  res.json({ message: "Marked as read" });
});

export const markAllNotificationsRead = asyncHandler(async (req: Request, res: Response) => {
  const count = await repo.markAllRead(req.user!.id);
  res.json({ count });
});

export const deleteNotification = asyncHandler(async (req: Request, res: Response) => {
  const deleted = await repo.deleteNotification(req.params.id, req.user!.id);
  if (!deleted) throw ApiError.notFound("Notification not found");
  res.json({ success: true });
});

export const getPushConfig = asyncHandler(async (_req: Request, res: Response) => {
  const config = getPublicFcmConfig();
  res.json({
    configured: config.configured && Boolean(config.apiKey && config.projectId && config.vapidKey),
    firebase: {
      apiKey: config.apiKey,
      authDomain: config.authDomain,
      projectId: config.projectId,
      messagingSenderId: config.messagingSenderId,
      appId: config.appId,
      vapidKey: config.vapidKey,
    },
  });
});

const registerDeviceSchema = z.object({
  token: z.string().min(20).max(4096),
  platform: z.enum(["web", "android", "ios"]).optional().default("web"),
});

export const registerPushDevice = asyncHandler(async (req: Request, res: Response) => {
  if (!isFcmConfigured()) {
    throw ApiError.badRequest("Push notifications are not configured on this server.");
  }
  const input = registerDeviceSchema.parse(req.body);
  console.info("[fcm] register device request", {
    employeeId: req.user!.id,
    platform: input.platform,
    tokenSuffix: input.token.trim().slice(-12),
  });
  const device = await pushRepo.upsertDeviceToken({
    employeeId: req.user!.id,
    token: input.token.trim(),
    platform: input.platform,
    userAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null,
  });
  res.json({
    id: device.id,
    platform: device.platform,
    lastSeenAt: device.last_seen_at,
    tokenSuffix: input.token.trim().slice(-12),
  });
});

const unregisterDeviceSchema = z.object({
  token: z.string().min(20).max(4096),
});

export const unregisterPushDevice = asyncHandler(async (req: Request, res: Response) => {
  const input = unregisterDeviceSchema.parse(req.body);
  await pushRepo.deleteDeviceToken(req.user!.id, input.token.trim());
  console.info("[fcm] device unregistered", {
    employeeId: req.user!.id,
    tokenSuffix: input.token.trim().slice(-12),
  });
  res.json({ success: true });
});

export const getMyPushPreferences = asyncHandler(async (req: Request, res: Response) => {
  const preferences = await pushRepo.getNotificationPreferences(req.user!.id);
  res.json({
    preferences: {
      ...preferences,
      securityAlerts: true,
    },
  });
});

const preferencesSchema = z.object({
  soundEnabled: z.boolean(),
  vibrationEnabled: z.boolean(),
  attendanceReminders: z.boolean(),
  taskNotifications: z.boolean(),
  leaveNotifications: z.boolean(),
  expenseNotifications: z.boolean(),
});

export const updateMyPushPreferences = asyncHandler(async (req: Request, res: Response) => {
  const input = preferencesSchema.parse(req.body);
  const preferences = await pushRepo.upsertNotificationPreferences(req.user!.id, input);
  res.json({
    preferences: {
      ...preferences,
      securityAlerts: true,
    },
  });
});

export const getMyPushStatus = asyncHandler(async (req: Request, res: Response) => {
  const runtime = getFcmRuntimeStatus();
  const devices = await pushRepo.listTokensForEmployees([req.user!.id]);
  const preferences = await pushRepo.getNotificationPreferences(req.user!.id);
  res.json({
    ...runtime,
    deviceCount: devices.length,
    devices: devices.map((d) => ({
      id: d.id,
      platform: d.platform,
      tokenSuffix: d.token.slice(-12),
      lastSeenAt: d.last_seen_at,
      createdAt: d.created_at,
    })),
    preferences: {
      ...preferences,
      securityAlerts: true,
    },
  });
});

export const sendTestPush = asyncHandler(async (req: Request, res: Response) => {
  console.info("[fcm] test push API called", { employeeId: req.user!.id });
  const outcome = await sendTestPushToEmployee(req.user!.id);
  if (!outcome.configured) {
    throw ApiError.badRequest("Firebase is not configured on this server.");
  }
  if (!outcome.initialized) {
    throw ApiError.badRequest(
      "Firebase Admin SDK failed to initialize. Check FIREBASE_SERVICE_ACCOUNT_JSON."
    );
  }
  if (outcome.tokensFound === 0) {
    throw ApiError.badRequest(
      "No FCM device token is saved for your account. Enable push notifications in My Profile first."
    );
  }
  res.json({
    ok: (outcome.result?.successCount ?? 0) > 0,
    ...outcome,
  });
});
