import type { MonthlyCellStatus, MonthlyDayCell, MonthlySummary } from "./attendance.monthly";

export type AttendanceRecordLike = {
  status?: string;
  day_status?: string | null;
  check_in_status?: string | null;
  check_in_time?: string | Date | null;
  is_half_day?: boolean;
  is_admin_marked?: boolean;
  admin_mark_status?: string | null;
  special_day_status?: string | null;
  total_minutes?: number | null;
};

/** Statuses that represent actual work and contribute worked minutes. */
export const WORKED_MINUTE_STATUSES: ReadonlySet<MonthlyCellStatus> = new Set([
  "present",
  "half_day",
  "holiday_worked",
  "weekly_off_worked",
]);

/** Statuses where a late check-in is meaningful. */
export const LATE_ELIGIBLE_STATUSES: ReadonlySet<MonthlyCellStatus> = new Set([
  "present",
  "half_day",
  "holiday_worked",
  "weekly_off_worked",
]);

/** True when the day has no check-in and was not manually finalized by an admin. */
export function isIncompleteAttendanceDay(record: unknown): boolean {
  const row = record as AttendanceRecordLike;
  if (row.is_admin_marked) return false;
  if (row.status === "absent" || row.day_status === "absent") return false;
  return !row.check_in_time;
}

export function cellStatusFromRecord(
  record: AttendanceRecordLike,
  isWeeklyOff: boolean,
  isHoliday: boolean
): MonthlyCellStatus {
  if (record.is_admin_marked && record.admin_mark_status) {
    return record.admin_mark_status as MonthlyCellStatus;
  }

  const special = record.special_day_status;
  if (special === "holiday_worked" || (isHoliday && !special)) {
    return "holiday_worked";
  }
  if (special === "weekly_off_worked" || (isWeeklyOff && !isHoliday)) {
    return "weekly_off_worked";
  }

  if (record.day_status === "present") return "present";
  if (record.day_status === "half_day") return "half_day";
  if (record.day_status === "absent") return "absent";
  if (record.status === "checked_in") {
    if (record.is_half_day || record.check_in_status === "half_day") return "half_day";
    return "present";
  }
  if (record.status === "absent") return "absent";
  return "present";
}

/**
 * Resolves a day cell status from attendance data and calendar rules.
 * Today without check-in stays pending (none) until closing cutoff or admin action.
 */
export function resolveDayStatus(input: {
  record: AttendanceRecordLike | null;
  hasLeave: boolean;
  isHoliday: boolean;
  isWeeklyOff: boolean;
  isFuture: boolean;
  isToday: boolean;
  isPastClosingCutoff: boolean;
}): MonthlyCellStatus {
  const { record, hasLeave, isHoliday, isWeeklyOff, isFuture, isToday, isPastClosingCutoff } =
    input;

  if (record) {
    if (isToday && !isPastClosingCutoff && isIncompleteAttendanceDay(record)) {
      return "none";
    }
    return cellStatusFromRecord(record, isWeeklyOff, isHoliday);
  }
  if (hasLeave) return "leave";
  if (isHoliday) return "holiday";
  if (isWeeklyOff) return "weekly_off";
  if (isFuture || isToday) return "none";
  return "absent";
}

/**
 * Working Days = elapsed calendar days in range − weekly offs − holidays − pending days.
 * Pending days (status "none") include today before cutoff; future days are excluded.
 */
export function computeWorkingDays(days: MonthlyDayCell[], todayStr: string): number {
  let elapsed = 0;
  let weeklyOff = 0;
  let holidays = 0;
  let pending = 0;

  for (const day of days) {
    if (day.status === "not_applicable") continue;
    if (day.date > todayStr) continue;
    elapsed += 1;
    if (day.status === "weekly_off") weeklyOff += 1;
    else if (day.status === "holiday") holidays += 1;
    else if (day.status === "none") pending += 1;
  }

  return Math.max(0, elapsed - weeklyOff - holidays - pending);
}

export function computeAttendancePercentage(summary: MonthlySummary): number {
  if (summary.workingDays <= 0) return 0;

  const credited =
    summary.present +
    summary.halfDay * 0.5 +
    summary.leave +
    summary.holidayWorked +
    summary.weeklyOffWorked;

  return Math.round((credited / summary.workingDays) * 1000) / 10;
}

/** Builds every summary counter directly from day cells so calendar and stats always match. */
export function buildSummaryFromDays(days: MonthlyDayCell[], todayStr: string): MonthlySummary {
  let present = 0;
  let halfDay = 0;
  let absent = 0;
  let leave = 0;
  let weeklyOff = 0;
  let holidays = 0;
  let holidayWorked = 0;
  let weeklyOffWorked = 0;
  let totalMinutes = 0;
  let lateCheckIns = 0;

  for (const day of days) {
    if (day.status === "not_applicable") continue;

    switch (day.status) {
      case "present":
        present += 1;
        break;
      case "half_day":
        halfDay += 1;
        break;
      case "absent":
        absent += 1;
        break;
      case "leave":
        leave += 1;
        break;
      case "weekly_off":
        weeklyOff += 1;
        break;
      case "holiday":
        holidays += 1;
        break;
      case "holiday_worked":
        holidayWorked += 1;
        break;
      case "weekly_off_worked":
        weeklyOffWorked += 1;
        break;
      default:
        break;
    }

    if (day.totalMinutes && WORKED_MINUTE_STATUSES.has(day.status)) {
      totalMinutes += day.totalMinutes;
    }
    if (day.late && LATE_ELIGIBLE_STATUSES.has(day.status)) {
      lateCheckIns += 1;
    }
  }

  const workingDays = computeWorkingDays(days, todayStr);
  const partial: MonthlySummary = {
    present,
    halfDay,
    absent,
    leave,
    weeklyOff,
    holidays,
    holidayWorked,
    weeklyOffWorked,
    totalMinutes,
    workingDays,
    attendancePercentage: 0,
    lateCheckIns,
  };
  partial.attendancePercentage = computeAttendancePercentage(partial);
  return partial;
}

/** Classifies dashboard bucket from a resolved monthly cell status. */
export function dashboardBucketFromStatus(
  status: MonthlyCellStatus
): "present" | "half_day" | "absent" | "pending" {
  switch (status) {
    case "present":
    case "holiday_worked":
    case "weekly_off_worked":
      return "present";
    case "half_day":
      return "half_day";
    case "none":
    case "not_applicable":
      return "pending";
    default:
      return "absent";
  }
}
