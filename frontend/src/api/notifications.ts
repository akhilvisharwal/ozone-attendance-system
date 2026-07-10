import { apiClient } from "./client";
import type { AppNotification } from "@/types";

export async function listNotifications() {
  const res = await apiClient.get<{ notifications: AppNotification[] }>("/notifications");
  return res.data.notifications;
}

export async function getUnreadCount() {
  const res = await apiClient.get<{ count: number }>("/notifications/unread-count");
  return res.data.count;
}

export async function markNotificationRead(id: string) {
  await apiClient.patch(`/notifications/${id}/read`);
}

export async function markAllNotificationsRead() {
  const res = await apiClient.patch<{ count: number }>("/notifications/read-all");
  return res.data.count;
}

export async function deleteNotification(id: string) {
  await apiClient.delete(`/notifications/${id}`);
}
