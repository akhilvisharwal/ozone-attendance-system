import type {
  AttendanceRecord,
  MonthlyDayCell,
  MonthlyCellStatus,
  MonthlySummary,
} from "@/types";

export type PerformanceLevel = "excellent" | "good" | "average" | "needs_improvement";

export interface ExtendedMonthlyStats {
  avgCheckInTime: string | null;
  avgCheckOutTime: string | null;
  overtimeMinutes: number;
  attendanceStreak: number;
  performanceLevel: PerformanceLevel;
  performanceLabel: string;
}

const PERFORMANCE_META: Record<PerformanceLevel, { label: string }> = {
  excellent: { label: "Excellent" },
  good: { label: "Good" },
  average: { label: "Average" },
  needs_improvement: { label: "Needs Improvement" },
};

const STREAK_STATUSES: ReadonlySet<MonthlyCellStatus> = new Set([
  "present",
  "half_day",
  "holiday_worked",
  "weekly_off_worked",
]);

function localDateStr(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function timeToMinutes(iso: string): number {
  const date = new Date(iso);
  return date.getHours() * 60 + date.getMinutes();
}

function formatAverageTime(totalMinutes: number, count: number): string | null {
  if (count === 0) return null;
  const avg = Math.round(totalMinutes / count);
  const date = new Date();
  date.setHours(Math.floor(avg / 60), avg % 60, 0, 0);
  return date.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function monthDateRange(month: string): { from: string; to: string } {
  const [year, m] = month.split("-").map(Number);
  const daysInMonth = new Date(year, m, 0).getDate();
  const prefix = `${year}-${String(m).padStart(2, "0")}`;
  return {
    from: `${prefix}-01`,
    to: `${prefix}-${String(daysInMonth).padStart(2, "0")}`,
  };
}

export function shiftMonthString(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function computeRecordTimingStats(
  records: AttendanceRecord[],
  checkoutStandardTime: string | null
): Pick<ExtendedMonthlyStats, "avgCheckInTime" | "avgCheckOutTime" | "overtimeMinutes"> {
  let checkInTotal = 0;
  let checkInCount = 0;
  let checkOutTotal = 0;
  let checkOutCount = 0;
  let overtimeMinutes = 0;

  const closingMatch = checkoutStandardTime?.match(/^(\d{2}):(\d{2})$/);
  const closingMinutes = closingMatch
    ? Number(closingMatch[1]) * 60 + Number(closingMatch[2])
    : null;

  for (const record of records) {
    if (record.check_in_time) {
      checkInTotal += timeToMinutes(record.check_in_time);
      checkInCount += 1;
    }
    if (record.check_out_time) {
      const outMinutes = timeToMinutes(record.check_out_time);
      checkOutTotal += outMinutes;
      checkOutCount += 1;
      if (record.check_out_status === "overtime" && closingMinutes !== null && outMinutes > closingMinutes) {
        overtimeMinutes += outMinutes - closingMinutes;
      }
    }
  }

  return {
    avgCheckInTime: formatAverageTime(checkInTotal, checkInCount),
    avgCheckOutTime: formatAverageTime(checkOutTotal, checkOutCount),
    overtimeMinutes,
  };
}

/** Consecutive qualifying attendance days ending today or the most recent working day. */
export function computeAttendanceStreak(
  dayCellsByDate: Map<string, MonthlyDayCell>,
  todayIso: string
): number {
  let streak = 0;
  const cursor = new Date(`${todayIso}T12:00:00`);

  for (let i = 0; i < 366; i += 1) {
    const dateStr = localDateStr(cursor);
    const cell = dayCellsByDate.get(dateStr);

    if (!cell || cell.status === "none") {
      if (dateStr > todayIso) {
        cursor.setDate(cursor.getDate() - 1);
        continue;
      }
      break;
    }

    if (cell.status === "weekly_off" || cell.status === "holiday" || cell.status === "not_applicable") {
      cursor.setDate(cursor.getDate() - 1);
      continue;
    }

    if (dateStr === todayIso && cell.status === "absent") {
      cursor.setDate(cursor.getDate() - 1);
      continue;
    }

    if (STREAK_STATUSES.has(cell.status)) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
      continue;
    }

    break;
  }

  return streak;
}

export function getPerformanceLevel(summary: MonthlySummary): PerformanceLevel {
  if (summary.workingDays <= 0) {
    const credited =
      summary.present +
      summary.halfDay +
      summary.leave +
      summary.holidayWorked +
      summary.weeklyOffWorked;
    if (credited === 0) return "needs_improvement";
  }

  const lateRate = summary.workingDays > 0 ? summary.lateCheckIns / summary.workingDays : 0;

  if (summary.attendancePercentage >= 95 && lateRate <= 0.1) return "excellent";
  if (summary.attendancePercentage >= 85 && lateRate <= 0.2) return "good";
  if (summary.attendancePercentage >= 70) return "average";
  return "needs_improvement";
}

export function buildExtendedMonthlyStats(
  summary: MonthlySummary,
  records: AttendanceRecord[],
  dayCellsByDate: Map<string, MonthlyDayCell>,
  todayIso: string,
  checkoutStandardTime: string | null
): ExtendedMonthlyStats {
  const timing = computeRecordTimingStats(records, checkoutStandardTime);
  const performanceLevel = getPerformanceLevel(summary);

  return {
    ...timing,
    attendanceStreak: computeAttendanceStreak(dayCellsByDate, todayIso),
    performanceLevel,
    performanceLabel: PERFORMANCE_META[performanceLevel].label,
  };
}

export function mergeDayCells(grids: { days: MonthlyDayCell[] }[]): Map<string, MonthlyDayCell> {
  const map = new Map<string, MonthlyDayCell>();
  for (const grid of grids) {
    for (const day of grid.days) {
      map.set(day.date, day);
    }
  }
  return map;
}
