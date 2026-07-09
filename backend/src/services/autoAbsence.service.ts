import { pool } from "../config/db";
import { todayDateString } from "../utils/date";
import { getSettings } from "../modules/settings/settings.cache";
import { normalizeAttendanceSettings } from "../utils/settingsHelpers";
import {
  getAutoAbsenceCutoffBounds,
  getEffectiveClosingTimesForEmployees,
  parseClosingTime,
  type TimeOfDay,
} from "../modules/attendance/attendanceRules.service";
import { resolveWeeklyOffDays } from "../utils/weeklyOffDays";
import * as attendanceRepo from "../modules/attendance/attendance.repository";
import * as employeesRepo from "../modules/employees/employees.repository";
import * as holidaysRepo from "../modules/holidays/holidays.repository";
import { resolveHolidaysInRange } from "../modules/holidays/holidays.service";

const SYSTEM_JOBS_CATEGORY = "system_jobs";
const AUTO_ABSENCE_REASON = "Auto-marked absent at end of day";

export interface AutoAbsenceRunResult {
  date: string;
  marked: number;
  eligible: number;
  skipped: number;
  alreadyRan: boolean;
}

function localDateString(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function isPastTimeCutoff(now: Date, cutoff: TimeOfDay, date: string): boolean {
  if (date !== localDateString(now)) return true;
  if (now.getHours() > cutoff.hour) return true;
  if (now.getHours() === cutoff.hour && now.getMinutes() >= cutoff.minute) return true;
  return false;
}

/** Latest effective closing time across active employees (legacy single-cutoff helper). */
export async function getAutoAbsenceCutoffForDate(
  date: string
): Promise<{ hour: number; minute: number }> {
  const employees = await employeesRepo.listActiveEmployeesForGrid();
  const closingByEmployee = await getEffectiveClosingTimesForEmployees(
    date,
    employees.map((employee) => employee.id)
  );
  const { latest } = getAutoAbsenceCutoffBounds(closingByEmployee);
  return latest;
}

/** @deprecated use getAutoAbsenceCutoffForDate */
export function getAutoAbsenceCutoff(): { hour: number; minute: number } {
  const closing = normalizeAttendanceSettings(getSettings().attendance).officeClosingTime;
  return parseClosingTime(closing);
}

export async function isPastAutoAbsenceCutoffForDate(
  date: string,
  now: Date = new Date()
): Promise<boolean> {
  const employees = await employeesRepo.listActiveEmployeesForGrid();
  const closingByEmployee = await getEffectiveClosingTimesForEmployees(
    date,
    employees.map((employee) => employee.id)
  );
  const { earliest } = getAutoAbsenceCutoffBounds(closingByEmployee);
  return isPastTimeCutoff(now, earliest, date);
}

export function isPastAutoAbsenceCutoff(now: Date = new Date()): boolean {
  const { hour, minute } = getAutoAbsenceCutoff();
  if (now.getHours() > hour) return true;
  if (now.getHours() === hour && now.getMinutes() >= minute) return true;
  return false;
}

function weekdayForDateString(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day).getDay();
}

async function getAutoAbsenceLastRunDate(): Promise<string | null> {
  const result = await pool.query<{ last_run: string | null }>(
    `SELECT value->>'autoAbsenceLastRun' AS last_run
       FROM app_settings
      WHERE category = $1`,
    [SYSTEM_JOBS_CATEGORY]
  );
  return result.rows[0]?.last_run ?? null;
}

async function setAutoAbsenceLastRunDate(date: string): Promise<void> {
  await pool.query(
    `INSERT INTO app_settings (category, value)
     VALUES ($1, jsonb_build_object('autoAbsenceLastRun', $2::text))
     ON CONFLICT (category) DO UPDATE
       SET value = app_settings.value || jsonb_build_object('autoAbsenceLastRun', $2::text),
           updated_at = now()`,
    [SYSTEM_JOBS_CATEGORY, date]
  );
}

/**
 * Marks active employees absent when they have no check-in for the day and are
 * not on approved leave, a company holiday, or their weekly off.
 * Uses each employee's effective closing time (including daily overrides).
 * Idempotent per employee (existing attendance rows are left unchanged).
 */
export async function runAutoAbsenceMarking(
  options: { date?: string; force?: boolean; now?: Date } = {}
): Promise<AutoAbsenceRunResult> {
  const date = options.date ?? todayDateString();
  const now = options.now ?? new Date();

  const employees = await employeesRepo.listActiveEmployeesForGrid();
  const employeeIds = employees.map((employee) => employee.id);
  const closingByEmployee = await getEffectiveClosingTimesForEmployees(date, employeeIds);
  const { earliest, latest } = getAutoAbsenceCutoffBounds(closingByEmployee);

  if (!options.force && !isPastTimeCutoff(now, earliest, date)) {
    return { date, marked: 0, eligible: 0, skipped: 0, alreadyRan: false };
  }

  const lastRun = await getAutoAbsenceLastRunDate();
  if (!options.force && lastRun === date && isPastTimeCutoff(now, latest, date)) {
    return { date, marked: 0, eligible: 0, skipped: 0, alreadyRan: true };
  }

  const attendanceRows = await attendanceRepo.listAttendanceInRange(date, date);
  const leaveRows = await attendanceRepo.listApprovedLeavesInRange(date, date);
  const holidayRows = await holidaysRepo.listHolidaysForRange(date, date);
  const holidayMap = resolveHolidaysInRange(holidayRows, date, date);
  const isCompanyHoliday = holidayMap.has(date);
  const weekday = weekdayForDateString(date);

  const hasAttendance = new Set(attendanceRows.map((row) => row.employee_id));
  const onApprovedLeave = new Set(leaveRows.map((row) => row.employee_id));

  const toMark: string[] = [];
  let skipped = 0;

  for (const employee of employees) {
    if (hasAttendance.has(employee.id)) {
      skipped += 1;
      continue;
    }
    if (onApprovedLeave.has(employee.id)) {
      skipped += 1;
      continue;
    }
    if (isCompanyHoliday) {
      skipped += 1;
      continue;
    }
    const weeklyOff = resolveWeeklyOffDays(employee);
    if (weeklyOff.includes(weekday)) {
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

  const marked = await attendanceRepo.insertAutoAbsentRecords(toMark, date);

  if (isPastTimeCutoff(now, latest, date)) {
    await setAutoAbsenceLastRunDate(date);
  }

  if (marked > 0) {
    console.log(
      `[auto-absence] Marked ${marked} employee(s) absent for ${date} (${AUTO_ABSENCE_REASON}).`
    );
  } else {
    console.log(`[auto-absence] No new absences for ${date}.`);
  }

  return {
    date,
    marked,
    eligible: toMark.length,
    skipped,
    alreadyRan: false,
  };
}
