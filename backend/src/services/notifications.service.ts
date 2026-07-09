import type { NotificationSettings } from "../modules/settings/settings.types";
import { getSettings } from "../modules/settings/settings.cache";
import * as notificationsRepo from "../modules/notifications/notifications.repository";
import { pool } from "../config/db";

export function getNotificationSettings(): NotificationSettings {
  return getSettings().notifications;
}

export function resolveNotificationGates(settings: NotificationSettings) {
  return {
    email: settings.emailEnabled,
    leaveApproval: settings.emailEnabled && settings.leaveApproval,
    attendanceReminder: settings.emailEnabled && settings.attendanceReminder,
    holiday: settings.emailEnabled && settings.holidayNotifications,
  };
}

export function isEmailNotificationsEnabled(): boolean {
  return resolveNotificationGates(getNotificationSettings()).email;
}

export function isLeaveApprovalNotificationsEnabled(): boolean {
  return resolveNotificationGates(getNotificationSettings()).leaveApproval;
}

export function isAttendanceReminderNotificationsEnabled(): boolean {
  return resolveNotificationGates(getNotificationSettings()).attendanceReminder;
}

export function isHolidayNotificationsEnabled(): boolean {
  return resolveNotificationGates(getNotificationSettings()).holiday;
}

async function listActiveAdminIds(): Promise<string[]> {
  const result = await pool.query<{ id: string }>(
    `SELECT id FROM employees
      WHERE role = 'admin' AND is_active = true AND deleted_at IS NULL`
  );
  return result.rows.map((row) => row.id);
}

async function listActiveEmployeeIds(): Promise<string[]> {
  const result = await pool.query<{ id: string }>(
    `SELECT id FROM employees
      WHERE role = 'employee' AND is_active = true AND deleted_at IS NULL`
  );
  return result.rows.map((row) => row.id);
}

/** Notification hooks — respects toggles for email and in-app delivery. */
export async function notifyLeaveSubmitted(payload: {
  employeeName: string;
  leaveDate: string;
  category: string;
}) {
  if (!isLeaveApprovalNotificationsEnabled()) return;

  console.info("[notification] leave submitted", payload);

  const adminIds = await listActiveAdminIds();
  if (adminIds.length === 0) return;

  await notificationsRepo.createNotificationsForEmployees(adminIds, {
    type: "leave_submitted",
    title: "New leave request",
    body: `${payload.employeeName} submitted ${payload.category} leave for ${payload.leaveDate}.`,
    linkPath: "/admin/leaves",
  });
}

export async function notifyLeaveReviewed(payload: {
  employeeId: string;
  employeeName: string;
  status: string;
  leaveDate: string;
}) {
  if (!isLeaveApprovalNotificationsEnabled()) return;

  console.info("[notification] leave reviewed", payload);

  const statusLabel = payload.status === "approved" ? "approved" : "rejected";
  await notificationsRepo.createNotification({
    employeeId: payload.employeeId,
    type: "leave_reviewed",
    title: `Leave ${statusLabel}`,
    body: `Your leave request for ${payload.leaveDate} was ${statusLabel}.`,
    linkPath: "/leaves",
  });
}

export async function notifyAttendanceReminder(payload: { employeeId: string; employeeName: string }) {
  if (!isAttendanceReminderNotificationsEnabled()) return;

  console.info("[notification] attendance reminder", payload);

  await notificationsRepo.createNotification({
    employeeId: payload.employeeId,
    type: "attendance_reminder",
    title: "Attendance reminder",
    body: "You have not checked in yet today. Please mark your attendance.",
    linkPath: "/",
  });
}

export async function notifyHoliday(payload: { title: string; date: string }) {
  if (!isHolidayNotificationsEnabled()) return;

  console.info("[notification] holiday", payload);

  const employeeIds = await listActiveEmployeeIds();
  if (employeeIds.length === 0) return;

  await notificationsRepo.createNotificationsForEmployees(employeeIds, {
    type: "holiday",
    title: "Company holiday",
    body: `${payload.title} on ${payload.date}.`,
    linkPath: "/",
  });
}
