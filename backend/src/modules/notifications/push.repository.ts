import { pool } from "../../config/db";

export type PushCategory = "attendance" | "task" | "leave" | "expense" | "security";

export interface EmployeeNotificationPreferences {
  employee_id: string;
  sound_enabled: boolean;
  vibration_enabled: boolean;
  attendance_reminders: boolean;
  task_notifications: boolean;
  leave_notifications: boolean;
  expense_notifications: boolean;
  updated_at: string;
}

export interface PushDeviceToken {
  id: string;
  employee_id: string;
  token: string;
  platform: string;
  user_agent: string | null;
  created_at: string;
  last_seen_at: string;
}

export const DEFAULT_NOTIFICATION_PREFERENCES = {
  soundEnabled: true,
  vibrationEnabled: true,
  attendanceReminders: true,
  taskNotifications: true,
  leaveNotifications: true,
  expenseNotifications: true,
} as const;

export function mapNotificationTypeToCategory(type: string): PushCategory {
  if (type.startsWith("security_") || type.startsWith("otp_") || type === "password_reset") {
    return "security";
  }
  if (type.startsWith("attendance_") || type === "holiday") {
    return "attendance";
  }
  if (
    type.startsWith("task_") ||
    type.startsWith("extension_") ||
    type === "task_assigned" ||
    type === "task_updated" ||
    type === "task_comment"
  ) {
    return "task";
  }
  if (type.startsWith("leave_")) {
    return "leave";
  }
  if (type.startsWith("expense_")) {
    return "expense";
  }
  return "task";
}

function rowToPrefs(row: EmployeeNotificationPreferences) {
  return {
    soundEnabled: row.sound_enabled,
    vibrationEnabled: row.vibration_enabled,
    attendanceReminders: row.attendance_reminders,
    taskNotifications: row.task_notifications,
    leaveNotifications: row.leave_notifications,
    expenseNotifications: row.expense_notifications,
    updatedAt: row.updated_at,
  };
}

export async function getNotificationPreferences(employeeId: string) {
  const result = await pool.query<EmployeeNotificationPreferences>(
    `SELECT * FROM employee_notification_preferences WHERE employee_id = $1`,
    [employeeId]
  );
  const row = result.rows[0];
  if (!row) {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES, updatedAt: null as string | null };
  }
  return rowToPrefs(row);
}

export async function upsertNotificationPreferences(
  employeeId: string,
  input: {
    soundEnabled: boolean;
    vibrationEnabled: boolean;
    attendanceReminders: boolean;
    taskNotifications: boolean;
    leaveNotifications: boolean;
    expenseNotifications: boolean;
  }
) {
  const result = await pool.query<EmployeeNotificationPreferences>(
    `INSERT INTO employee_notification_preferences (
       employee_id, sound_enabled, vibration_enabled,
       attendance_reminders, task_notifications, leave_notifications, expense_notifications, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, now())
     ON CONFLICT (employee_id) DO UPDATE SET
       sound_enabled = EXCLUDED.sound_enabled,
       vibration_enabled = EXCLUDED.vibration_enabled,
       attendance_reminders = EXCLUDED.attendance_reminders,
       task_notifications = EXCLUDED.task_notifications,
       leave_notifications = EXCLUDED.leave_notifications,
       expense_notifications = EXCLUDED.expense_notifications,
       updated_at = now()
     RETURNING *`,
    [
      employeeId,
      input.soundEnabled,
      input.vibrationEnabled,
      input.attendanceReminders,
      input.taskNotifications,
      input.leaveNotifications,
      input.expenseNotifications,
    ]
  );
  return rowToPrefs(result.rows[0]);
}

export async function upsertDeviceToken(input: {
  employeeId: string;
  token: string;
  platform?: string;
  userAgent?: string | null;
}): Promise<PushDeviceToken> {
  const result = await pool.query<PushDeviceToken>(
    `INSERT INTO push_device_tokens (employee_id, token, platform, user_agent, last_seen_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (token) DO UPDATE SET
       employee_id = EXCLUDED.employee_id,
       platform = EXCLUDED.platform,
       user_agent = COALESCE(EXCLUDED.user_agent, push_device_tokens.user_agent),
       last_seen_at = now()
     RETURNING *`,
    [input.employeeId, input.token, input.platform ?? "web", input.userAgent ?? null]
  );
  return result.rows[0];
}

export async function deleteDeviceToken(employeeId: string, token: string): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM push_device_tokens WHERE employee_id = $1 AND token = $2`,
    [employeeId, token]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function listTokensForEmployees(employeeIds: string[]): Promise<PushDeviceToken[]> {
  if (employeeIds.length === 0) return [];
  const result = await pool.query<PushDeviceToken>(
    `SELECT * FROM push_device_tokens WHERE employee_id = ANY($1::uuid[])`,
    [employeeIds]
  );
  return result.rows;
}

export async function deleteTokens(tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;
  await pool.query(`DELETE FROM push_device_tokens WHERE token = ANY($1::text[])`, [tokens]);
}

export async function claimPushDelivery(notificationId: string): Promise<boolean> {
  const result = await pool.query(
    `INSERT INTO push_delivery_log (notification_id)
     VALUES ($1)
     ON CONFLICT (notification_id) DO NOTHING
     RETURNING notification_id`,
    [notificationId]
  );
  return (result.rowCount ?? 0) > 0;
}

export function isCategoryEnabled(
  prefs: Awaited<ReturnType<typeof getNotificationPreferences>>,
  category: PushCategory
): boolean {
  if (category === "security") return true;
  if (category === "attendance") return prefs.attendanceReminders;
  if (category === "task") return prefs.taskNotifications;
  if (category === "leave") return prefs.leaveNotifications;
  if (category === "expense") return prefs.expenseNotifications;
  return true;
}
