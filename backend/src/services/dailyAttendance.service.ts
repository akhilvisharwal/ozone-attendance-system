import { employeeJoinDate, closingTimestampForDate, minutesBetween, todayDateString, isPastTimeCutoff } from "../utils/date";
import { getSettings } from "../modules/settings/settings.cache";
import {
  getAutoAbsenceCutoffBounds,
  getEffectiveAttendanceRules,
  getEffectiveClosingTimesForEmployees,
  type TimeOfDay,
} from "../modules/attendance/attendanceRules.service";
import { resolveAutomaticDayStatus } from "../modules/attendance/attendanceDayStatus";
import { resolveWeeklyOffDays } from "../utils/weeklyOffDays";
import * as attendanceRepo from "../modules/attendance/attendance.repository";
import * as employeesRepo from "../modules/employees/employees.repository";
import * as holidaysRepo from "../modules/holidays/holidays.repository";
import { resolveHolidaysInRange } from "../modules/holidays/holidays.service";

export interface DailyAttendanceRunResult {
  date: string;
  markedAbsent: number;
  finalizedSessions: number;
  updatedDayStatus: number;
  eligibleAbsent: number;
  skipped: number;
  alreadyRan: boolean;
}

function weekdayForDateString(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day).getDay();
}

function isExcludedCalendarDay(input: {
  employeeId: string;
  date: string;
  weekday: number;
  isCompanyHoliday: boolean;
  onApprovedLeave: Set<string>;
  weeklyOffByEmployee: Map<string, number[]>;
}): boolean {
  if (input.onApprovedLeave.has(input.employeeId)) return true;
  if (input.isCompanyHoliday) return true;
  const weeklyOff = input.weeklyOffByEmployee.get(input.employeeId) ?? [];
  return weeklyOff.includes(input.weekday);
}

async function finalizeOpenSessionsForDate(
  date: string,
  now: Date,
  options: { force?: boolean }
): Promise<{ finalized: number; updated: number }> {
  const attendanceSettings = getSettings().attendance;
  const rows = await attendanceRepo.listAttendanceInRange(date, date);
  if (rows.length === 0) return { finalized: 0, updated: 0 };

  const employeeIds = [...new Set(rows.map((row) => row.employee_id as string))];
  const employees = await employeesRepo.listActiveEmployeesForGrid();
  const employeeById = new Map(employees.map((emp) => [emp.id, emp]));
  const closingByEmployee = await getEffectiveClosingTimesForEmployees(date, employeeIds);
  const { latest } = getAutoAbsenceCutoffBounds(closingByEmployee);

  let finalized = 0;
  let updated = 0;

  for (const row of rows) {
    if (row.is_admin_marked) continue;

    const employee = employeeById.get(row.employee_id);
    if (!employee) continue;
    if (date < employeeJoinDate(employee.created_at)) continue;

    const cutoff: TimeOfDay = closingByEmployee.get(row.employee_id) ?? latest;
    if (!options.force && !isPastTimeCutoff(now, cutoff, date)) continue;

    const { settings: effectiveRules } = await getEffectiveAttendanceRules(date, row.employee_id);

    if (row.status === "checked_in" && row.check_in_time) {
      const checkInTime = new Date(row.check_in_time);
      const checkOutTime = closingTimestampForDate(date, cutoff.hour, cutoff.minute);
      const totalMinutes = minutesBetween(checkInTime, checkOutTime);
      const dayStatus = resolveAutomaticDayStatus({
        isHalfDay: Boolean(row.is_half_day),
        checkInStatus: row.check_in_status,
        totalMinutes,
        autoCalculate: attendanceSettings.autoCalculate,
        settings: effectiveRules,
      });

      const saved = await attendanceRepo.finalizeAttendanceAtClosing({
        id: row.id,
        checkOutTime,
        totalMinutes,
        dayStatus,
      });
      if (saved) finalized += 1;
      continue;
    }

    if (row.status === "checked_out" && !row.day_status) {
      const dayStatus = resolveAutomaticDayStatus({
        isHalfDay: Boolean(row.is_half_day),
        checkInStatus: row.check_in_status,
        totalMinutes: row.total_minutes,
        autoCalculate: attendanceSettings.autoCalculate,
        settings: effectiveRules,
      });
      const applied = await attendanceRepo.applyAutomaticDayStatus({
        id: row.id,
        dayStatus,
      });
      if (applied) updated += 1;
    }
  }

  return { finalized, updated };
}

/**
 * End-of-day attendance engine:
 * 1. Finalizes open check-ins with automatic day_status from attendance rules.
 * 2. Marks absent for eligible employees with no attendance row after closing.
 * Skips pre-join dates, approved leave, holidays, and weekly offs.
 */
export async function runDailyAttendanceProcessing(
  options: { date?: string; force?: boolean; now?: Date } = {}
): Promise<DailyAttendanceRunResult> {
  const date = options.date ?? todayDateString();
  const now = options.now ?? new Date();

  const employees = await employeesRepo.listActiveEmployeesForGrid();
  const employeeIds = employees.map((employee) => employee.id);
  const closingByEmployee = await getEffectiveClosingTimesForEmployees(date, employeeIds);
  const { earliest, latest } = getAutoAbsenceCutoffBounds(closingByEmployee);

  if (!options.force && !isPastTimeCutoff(now, earliest, date)) {
    return {
      date,
      markedAbsent: 0,
      finalizedSessions: 0,
      updatedDayStatus: 0,
      eligibleAbsent: 0,
      skipped: 0,
      alreadyRan: false,
    };
  }

  const { finalized, updated } = await finalizeOpenSessionsForDate(date, now, options);

  const attendanceRows = await attendanceRepo.listAttendanceInRange(date, date);
  const leaveRows = await attendanceRepo.listApprovedLeavesInRange(date, date);
  const holidayRows = await holidaysRepo.listHolidaysForRange(date, date);
  const holidayMap = resolveHolidaysInRange(holidayRows, date, date);
  const isCompanyHoliday = holidayMap.has(date);
  const weekday = weekdayForDateString(date);
  const defaultWeeklyOffDays = getSettings().weeklyOff.defaultWeeklyOffDays;

  const hasAttendance = new Set(attendanceRows.map((row) => row.employee_id as string));
  const onApprovedLeave = new Set(leaveRows.map((row) => row.employee_id as string));
  const weeklyOffByEmployee = new Map(
    employees.map((emp) => [emp.id, resolveWeeklyOffDays(emp, defaultWeeklyOffDays)])
  );

  const toMark: string[] = [];
  let skipped = 0;

  for (const employee of employees) {
    if (date < employeeJoinDate(employee.created_at)) {
      skipped += 1;
      continue;
    }
    if (hasAttendance.has(employee.id)) {
      skipped += 1;
      continue;
    }
    if (
      isExcludedCalendarDay({
        employeeId: employee.id,
        date,
        weekday,
        isCompanyHoliday,
        onApprovedLeave,
        weeklyOffByEmployee,
      })
    ) {
      skipped += 1;
      continue;
    }

    const employeeCutoff = closingByEmployee.get(employee.id) ?? latest;
    if (!options.force && !isPastTimeCutoff(now, employeeCutoff, date)) {
      skipped += 1;
      continue;
    }

    toMark.push(employee.id);
  }

  const markedAbsent = await attendanceRepo.insertAutoAbsentRecords(toMark, date);

  if (markedAbsent > 0 || finalized > 0 || updated > 0) {
    console.log(
      `[daily-attendance] ${date}: absent=${markedAbsent}, finalized=${finalized}, day_status_updated=${updated}`
    );
  }

  return {
    date,
    markedAbsent,
    finalizedSessions: finalized,
    updatedDayStatus: updated,
    eligibleAbsent: toMark.length,
    skipped,
    alreadyRan: false,
  };
}
