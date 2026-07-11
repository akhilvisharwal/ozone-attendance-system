import { pool } from "../../config/db";
import { deliverPushForNotification, deliverPushForNotifications } from "./fcm.service";

export interface AppNotification {
  id: string;
  employee_id: string;
  type: string;
  title: string;
  body: string | null;
  link_path: string | null;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
}

function queuePush(notification: AppNotification): void {
  console.info("[fcm] queue push for notification", {
    notificationId: notification.id,
    employeeId: notification.employee_id,
    type: notification.type,
  });
  void deliverPushForNotification(notification).catch((err) => {
    console.error("[fcm] Failed to queue push:", err instanceof Error ? err.message : err);
  });
}

function queuePushMany(notifications: AppNotification[]): void {
  if (notifications.length === 0) return;
  console.info("[fcm] queue push batch", { count: notifications.length });
  void deliverPushForNotifications(notifications).catch((err) => {
    console.error("[fcm] Failed to queue push batch:", err instanceof Error ? err.message : err);
  });
}

export async function createNotification(input: {
  employeeId: string;
  type: string;
  title: string;
  body?: string | null;
  linkPath?: string | null;
  entityId?: string | null;
}): Promise<AppNotification> {
  const result = await pool.query<AppNotification>(
    `INSERT INTO app_notifications (employee_id, type, title, body, link_path, entity_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [
      input.employeeId,
      input.type,
      input.title,
      input.body ?? null,
      input.linkPath ?? null,
      input.entityId ?? null,
    ]
  );
  const notification = result.rows[0];
  queuePush(notification);
  return notification;
}

export async function createNotificationsForEmployees(
  employeeIds: string[],
  input: Omit<Parameters<typeof createNotification>[0], "employeeId">
): Promise<AppNotification[]> {
  if (employeeIds.length === 0) return [];
  const values: unknown[] = [];
  const rows = employeeIds.map((employeeId, index) => {
    const base = index * 6;
    values.push(
      employeeId,
      input.type,
      input.title,
      input.body ?? null,
      input.linkPath ?? null,
      input.entityId ?? null
    );
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`;
  });
  const result = await pool.query<AppNotification>(
    `INSERT INTO app_notifications (employee_id, type, title, body, link_path, entity_id)
     VALUES ${rows.join(", ")}
     RETURNING *`,
    values
  );
  queuePushMany(result.rows);
  return result.rows;
}

export async function listMyNotifications(employeeId: string, limit = 50): Promise<AppNotification[]> {
  const result = await pool.query<AppNotification>(
    `SELECT * FROM app_notifications
     WHERE employee_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [employeeId, limit]
  );
  return result.rows;
}

export async function countUnread(employeeId: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM app_notifications
     WHERE employee_id = $1 AND read_at IS NULL`,
    [employeeId]
  );
  return parseInt(result.rows[0]?.count ?? "0", 10);
}

export async function markRead(id: string, employeeId: string): Promise<boolean> {
  const result = await pool.query(
    `UPDATE app_notifications SET read_at = now()
     WHERE id = $1 AND employee_id = $2 AND read_at IS NULL`,
    [id, employeeId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function markAllRead(employeeId: string): Promise<number> {
  const result = await pool.query(
    `UPDATE app_notifications SET read_at = now()
     WHERE employee_id = $1 AND read_at IS NULL`,
    [employeeId]
  );
  return result.rowCount ?? 0;
}

export async function deleteNotification(id: string, employeeId: string): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM app_notifications WHERE id = $1 AND employee_id = $2`,
    [id, employeeId]
  );
  return (result.rowCount ?? 0) > 0;
}
