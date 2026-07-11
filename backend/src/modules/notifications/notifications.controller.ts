import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/errors";
import * as repo from "./notifications.repository";

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
