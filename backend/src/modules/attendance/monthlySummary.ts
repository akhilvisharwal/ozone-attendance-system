export {
  WORKED_MINUTE_STATUSES,
  LATE_ELIGIBLE_STATUSES,
  NON_SCHEDULED_WORKING_STATUSES,
  isIncompleteAttendanceDay,
  recordRepresentsWork,
  cellStatusFromRecord,
  resolveDayStatus,
  resolveDayStatus as resolveMonthlyDayStatus,
  computeWorkingDays,
  computePresentEquivalent,
  computeWorkedOnOffDays,
  formatPresentEquivalent,
  computeAttendancePercentage,
  buildSummaryFromDays,
  dashboardBucketFromStatus,
  applyAbsentSandwichRule,
  ABSENT_SANDWICH_REASON,
  SANDWICH_OFF_STATUSES,
} from "./attendanceCalculation.service";

import type { MonthlyDayCell, MonthlySummary } from "./attendance.monthly";
import { buildSummaryFromDays } from "./attendanceCalculation.service";

/** @deprecated Use buildSummaryFromDays */
export function finalizeMonthlySummary(
  days: MonthlyDayCell[],
  _summary: Omit<MonthlySummary, "workingDays" | "attendancePercentage">
): MonthlySummary {
  const todayStr = days.reduce((latest, day) => (day.date > latest ? day.date : latest), "");
  return buildSummaryFromDays(days, todayStr);
}
