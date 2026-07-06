import { getSettings } from "../modules/settings/settings.cache";

/** Notification hooks — respects toggles; extend with email/SMS providers later. */
export function notifyLeaveSubmitted(payload: { employeeName: string; leaveDate: string; category: string }) {
  const n = getSettings().notifications;
  if (!n.emailEnabled || !n.leaveApproval) return;
  console.info("[notification] leave submitted", payload);
}

export function notifyLeaveReviewed(payload: { employeeName: string; status: string; leaveDate: string }) {
  const n = getSettings().notifications;
  if (!n.emailEnabled || !n.leaveApproval) return;
  console.info("[notification] leave reviewed", payload);
}

export function notifyAttendanceReminder(payload: { employeeName: string }) {
  const n = getSettings().notifications;
  if (!n.emailEnabled || !n.attendanceReminder) return;
  console.info("[notification] attendance reminder", payload);
}

export function notifyHoliday(payload: { title: string; date: string }) {
  const n = getSettings().notifications;
  if (!n.emailEnabled || !n.holidayNotifications) return;
  console.info("[notification] holiday", payload);
}
