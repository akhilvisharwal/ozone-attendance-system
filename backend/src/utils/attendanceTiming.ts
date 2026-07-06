import { getSettings } from "../modules/settings/settings.cache";
import { normalizeAttendanceSettings } from "./settingsHelpers";

export type CheckInStatus  = "early" | "on_time" | "late" | "half_day";
export type CheckOutStatus = "early" | "on_time" | "overtime";
export type DayStatus      = "present" | "half_day" | "absent";

function timing() {
  return normalizeAttendanceSettings(getSettings().attendance);
}

/** Minute thresholds from admin settings (present / half-day). */
export function getDayStatusThresholds() {
  const a = timing();
  return {
    halfDayMinutes: Math.round(a.minHoursHalfDay * 60),
    fullDayMinutes: Math.round(a.minHoursPresent * 60),
  };
}

export function classifyDayStatus(totalMinutes: number | null | undefined): DayStatus {
  const t = getDayStatusThresholds();
  if (totalMinutes === null || totalMinutes === undefined || totalMinutes < t.halfDayMinutes) {
    return "absent";
  }
  if (totalMinutes < t.fullDayMinutes) return "half_day";
  return "present";
}

function hhmm(date: Date): string {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

export function classifyCheckIn(checkInTime: Date): {
  status: CheckInStatus;
  isHalfDay: boolean;
} {
  const a = timing();
  const t = hhmm(checkInTime);

  if (t < a.checkinOpenTime) return { status: "early", isHalfDay: false };
  if (t <= a.checkinOntimeEnd) return { status: "on_time", isHalfDay: false };
  if (t < a.halfDayCutoff) return { status: "late", isHalfDay: false };
  return { status: "half_day", isHalfDay: true };
}

export function classifyCheckOut(checkOutTime: Date): CheckOutStatus {
  const closing = timing().officeClosingTime;
  const t = hhmm(checkOutTime);
  if (t < closing) return "early";
  if (t === closing) return "on_time";
  return "overtime";
}

export function getTimingRules() {
  const a = timing();
  return {
    checkinOpenTime: a.checkinOpenTime,
    checkinOntimeEnd: a.checkinOntimeEnd,
    halfDayCutoff: a.halfDayCutoff,
    checkoutStandardTime: a.officeClosingTime,
    officeStartTime: a.officeStartTime,
    lateCheckInTime: a.lateCheckInTime,
    minHoursPresent: a.minHoursPresent,
    minHoursHalfDay: a.minHoursHalfDay,
  };
}

/** @deprecated use getDayStatusThresholds */
export const DAY_STATUS_THRESHOLDS = {
  get halfDayMinutes() { return getDayStatusThresholds().halfDayMinutes; },
  get fullDayMinutes() { return getDayStatusThresholds().fullDayMinutes; },
};
