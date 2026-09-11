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

/** True when the row represents actual work (check-in / present / half-day / HW / WW). */
export function recordRepresentsWork(record: AttendanceRecordLike): boolean {
  if (record.is_admin_marked && record.admin_mark_status) {
    return WORKED_MINUTE_STATUSES.has(record.admin_mark_status as MonthlyCellStatus);
  }
  if (record.special_day_status === "holiday_worked" || record.special_day_status === "weekly_off_worked") {
    return true;
  }
  if (record.day_status === "present" || record.day_status === "half_day") return true;
  if (record.status === "checked_in") return true;
  if (record.check_in_time) return true;
  return false;
}

function baseStatusFromRecord(record: AttendanceRecordLike): MonthlyCellStatus {
  if (record.is_admin_marked && record.admin_mark_status) {
    return record.admin_mark_status as MonthlyCellStatus;
  }
  if (record.special_day_status === "holiday_worked") return "holiday_worked";
  if (record.special_day_status === "weekly_off_worked") return "weekly_off_worked";
  if (record.day_status === "present") return "present";
  if (record.day_status === "half_day") return "half_day";
  if (record.day_status === "absent") return "absent";
  if (record.status === "checked_in") {
    if (record.is_half_day || record.check_in_status === "half_day") return "half_day";
    return "present";
  }
  if (record.status === "absent") return "absent";
  if (record.check_in_time) return "present";
  return "present";
}

/**
 * Promote real work on a holiday/weekly off to HW/WW.
 * Non-work rows (auto-absent, empty) stay as holiday/weekly off — they are not absences.
 */
function applyCalendarWorkStatus(
  status: MonthlyCellStatus,
  isWeeklyOff: boolean,
  isHoliday: boolean
): MonthlyCellStatus {
  const worked = WORKED_MINUTE_STATUSES.has(status);
  if (isHoliday) {
    if (worked) return "holiday_worked";
    if (status === "leave") return "leave";
    return "holiday";
  }
  if (isWeeklyOff) {
    if (worked) return "weekly_off_worked";
    if (status === "leave") return "leave";
    return "weekly_off";
  }
  return status;
}

export function cellStatusFromRecord(
  record: AttendanceRecordLike,
  isWeeklyOff: boolean,
  isHoliday: boolean
): MonthlyCellStatus {
  return applyCalendarWorkStatus(baseStatusFromRecord(record), isWeeklyOff, isHoliday);
}

/**
 * Resolves a day cell status from attendance data and calendar rules.
 * Today without check-in stays pending (none) until closing cutoff or admin action.
 * Approved leave on a working day is `leave` (shown as L, counted as absent).
 * Unworked holidays and weekly offs never become absent, even if leave is approved.
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
    const fromRecord = cellStatusFromRecord(record, isWeeklyOff, isHoliday);
    if (WORKED_MINUTE_STATUSES.has(fromRecord)) return fromRecord;
    if (isHoliday) return "holiday";
    if (isWeeklyOff) return "weekly_off";
    if (hasLeave || fromRecord === "leave") return "leave";
    return fromRecord;
  }
  if (isHoliday) return "holiday";
  if (isWeeklyOff) return "weekly_off";
  if (hasLeave) return "leave";
  if (isFuture || isToday) return "none";
  return "absent";
}

/**
 * Statuses that are not eligible scheduled working days for Att% / WD.
 * HW and WW are excluded from Present and Attendance %; they are counted
 * separately as worked-on-off-days for review. Approved leave stays `L` on
 * the grid but is an eligible working day (counted as absent).
 */
export const NON_SCHEDULED_WORKING_STATUSES: ReadonlySet<MonthlyCellStatus> = new Set([
  "not_applicable",
  "weekly_off",
  "holiday",
  "holiday_worked",
  "weekly_off_worked",
  "none",
]);

/**
 * Eligible scheduled working days: present + half-day + absent + approved leave.
 * Excludes holidays, weekly offs (worked or not), pre-join dates, and pending.
 */
export function computeWorkingDays(days: MonthlyDayCell[], todayStr: string): number {
  let count = 0;
  for (const day of days) {
    if (day.date > todayStr) continue;
    if (NON_SCHEDULED_WORKING_STATUSES.has(day.status)) continue;
    count += 1;
  }
  return count;
}

/** Present = P + (H × 0.5). HW and WW are not included. */
export function computePresentEquivalent(
  summary: Pick<MonthlySummary, "present" | "halfDay">
): number {
  return summary.present + summary.halfDay * 0.5;
}

/** HW + WW, each counted as 1. Unworked holidays/weekly offs are not included. */
export function computeWorkedOnOffDays(
  summary: Pick<MonthlySummary, "holidayWorked" | "weeklyOffWorked">
): number {
  return summary.holidayWorked + summary.weeklyOffWorked;
}

export function formatPresentEquivalent(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function computeAttendancePercentage(summary: MonthlySummary): number {
  if (summary.workingDays <= 0) return 0;
  const credited = computePresentEquivalent(summary);
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
        absent += 1;
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
  const presentEquivalent = computePresentEquivalent({ present, halfDay });
  const partial: MonthlySummary = {
    present,
    halfDay,
    absent,
    leave,
    weeklyOff,
    holidays,
    holidayWorked,
    weeklyOffWorked,
    presentEquivalent,
    totalMinutes,
    workingDays,
    attendancePercentage: 0,
    lateCheckIns,
  };
  partial.attendancePercentage = computeAttendancePercentage(partial);
  return partial;
}

/** Off-day statuses that can be converted to Absent by the sandwich rule. */
export const SANDWICH_OFF_STATUSES: ReadonlySet<MonthlyCellStatus> = new Set([
  "weekly_off",
  "holiday",
]);

/** Stored on auto-created sandwich absent rows so they can be recalculated/removed safely. */
export const ABSENT_SANDWICH_REASON = "Absent sandwich rule";

/**
 * Absent Sandwich Rule:
 * If an employee is Absent immediately before and after one or more consecutive
 * Weekly Off and/or Holiday days, those middle days become Absent.
 *
 * Example: Sat Absent → Sun Weekly Off → Mon Absent ⇒ Sun becomes Absent.
 * Also covers mixed blocks (WO + holidays) of any length.
 */
export function applyAbsentSandwichRule(days: MonthlyDayCell[]): MonthlyDayCell[] {
  if (days.length < 3) return days;

  const result = days.map((day) => ({ ...day }));
  let i = 0;

  while (i < result.length) {
    if (!SANDWICH_OFF_STATUSES.has(result[i].status)) {
      i += 1;
      continue;
    }

    const start = i;
    while (i < result.length && SANDWICH_OFF_STATUSES.has(result[i].status)) {
      i += 1;
    }
    const end = i - 1;

    const before = start > 0 ? result[start - 1] : null;
    const after = end + 1 < result.length ? result[end + 1] : null;

    if (before?.status === "absent" && after?.status === "absent") {
      for (let j = start; j <= end; j += 1) {
        result[j] = { ...result[j], status: "absent" };
      }
    }
  }

  return result;
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
    case "weekly_off":
    case "holiday":
      return "pending";
    default:
      return "absent";
  }
}
