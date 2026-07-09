import { getSettings } from "../modules/settings/settings.cache";

import { normalizeAttendanceSettings } from "./settingsHelpers";

import type { EffectiveAttendanceSettings } from "../modules/attendance/attendanceRules.service";



export type CheckInStatus  = "early" | "on_time" | "late" | "half_day";

export type CheckOutStatus = "early" | "on_time" | "overtime";

export type DayStatus      = "present" | "half_day" | "absent";



function timing() {

  return normalizeAttendanceSettings(getSettings().attendance);

}



export function classifyCheckInAt(

  checkInTime: Date,

  settings: EffectiveAttendanceSettings

): {

  status: CheckInStatus;

  isHalfDay: boolean;

} {

  const t = hhmm(checkInTime);



  if (t < settings.checkinOpenTime) return { status: "early", isHalfDay: false };

  if (t <= settings.checkinOntimeEnd) return { status: "on_time", isHalfDay: false };

  if (t < settings.halfDayCutoff) return { status: "late", isHalfDay: false };

  return { status: "half_day", isHalfDay: true };

}



export function classifyDayStatusAt(

  totalMinutes: number | null | undefined,

  settings: EffectiveAttendanceSettings

): DayStatus {

  const halfDayMinutes = Math.round(settings.minHoursHalfDay * 60);

  const fullDayMinutes = Math.round(settings.minHoursPresent * 60);

  if (totalMinutes === null || totalMinutes === undefined || totalMinutes < halfDayMinutes) {

    return "absent";

  }

  if (totalMinutes < fullDayMinutes) return "half_day";

  return "present";

}



export function classifyCheckOutAt(

  checkOutTime: Date,

  settings: EffectiveAttendanceSettings

): CheckOutStatus {

  const closing = settings.officeClosingTime;

  const t = hhmm(checkOutTime);

  if (t < closing) return "early";

  if (t === closing) return "on_time";

  return "overtime";

}



export function getTimingRulesFromSettings(settings: EffectiveAttendanceSettings) {

  return {

    checkinOpenTime: settings.checkinOpenTime,

    checkinOntimeEnd: settings.checkinOntimeEnd,

    halfDayCutoff: settings.halfDayCutoff,

    checkoutStandardTime: settings.officeClosingTime,

    officeStartTime: settings.officeStartTime,

    lateCheckInTime: settings.lateCheckInTime,

    minHoursPresent: settings.minHoursPresent,

    minHoursHalfDay: settings.minHoursHalfDay,

  };

}



/** Minute thresholds from admin settings (present / half-day). */

export function getDayStatusThresholds(settings: EffectiveAttendanceSettings = timing()) {

  return {

    halfDayMinutes: Math.round(settings.minHoursHalfDay * 60),

    fullDayMinutes: Math.round(settings.minHoursPresent * 60),

  };

}



export function classifyDayStatus(

  totalMinutes: number | null | undefined,

  settings: EffectiveAttendanceSettings = timing()

): DayStatus {

  return classifyDayStatusAt(totalMinutes, settings);

}



function hhmm(date: Date): string {

  const h = String(date.getHours()).padStart(2, "0");

  const m = String(date.getMinutes()).padStart(2, "0");

  return `${h}:${m}`;

}



export function classifyCheckIn(

  checkInTime: Date,

  settings: EffectiveAttendanceSettings = timing()

): {

  status: CheckInStatus;

  isHalfDay: boolean;

} {

  return classifyCheckInAt(checkInTime, settings);

}



export function classifyCheckOut(

  checkOutTime: Date,

  settings: EffectiveAttendanceSettings = timing()

): CheckOutStatus {

  return classifyCheckOutAt(checkOutTime, settings);

}



export function getTimingRules(settings: EffectiveAttendanceSettings = timing()) {

  return getTimingRulesFromSettings(settings);

}



/** @deprecated use getDayStatusThresholds */

export const DAY_STATUS_THRESHOLDS = {

  get halfDayMinutes() { return getDayStatusThresholds().halfDayMinutes; },

  get fullDayMinutes() { return getDayStatusThresholds().fullDayMinutes; },

};


