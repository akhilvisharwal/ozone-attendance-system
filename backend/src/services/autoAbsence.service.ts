import { pool } from "../config/db";
import { todayDateString, isPastTimeCutoff } from "../utils/date";
import {
  getAutoAbsenceCutoffBounds,
  getEffectiveClosingTimesForEmployees,
} from "../modules/attendance/attendanceRules.service";
import * as employeesRepo from "../modules/employees/employees.repository";
import { runDailyAttendanceProcessing } from "./dailyAttendance.service";

const SYSTEM_JOBS_CATEGORY = "system_jobs";

export interface AutoAbsenceRunResult {
  date: string;
  marked: number;
  eligible: number;
  skipped: number;
  finalized: number;
  alreadyRan: boolean;
}

export { isPastTimeCutoff };

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

/** @deprecated use isPastAutoAbsenceCutoffForDate */
export function isPastAutoAbsenceCutoff(now: Date = new Date()): boolean {
  const hour = now.getHours();
  const minute = now.getMinutes();
  return hour > 18 || (hour === 18 && minute >= 30);
}

/**
 * Runs end-of-day attendance processing (finalize open sessions + mark absences).
 * Idempotent per employee/day.
 */
export async function runAutoAbsenceMarking(
  options: { date?: string; force?: boolean; now?: Date } = {}
): Promise<AutoAbsenceRunResult> {
  const date = options.date ?? todayDateString();
  const now = options.now ?? new Date();

  const employees = await employeesRepo.listActiveEmployeesForGrid();
  const closingByEmployee = await getEffectiveClosingTimesForEmployees(
    date,
    employees.map((employee) => employee.id)
  );
  const { latest } = getAutoAbsenceCutoffBounds(closingByEmployee);

  const lastRun = await getAutoAbsenceLastRunDate();
  if (!options.force && lastRun === date && isPastTimeCutoff(now, latest, date)) {
    return { date, marked: 0, eligible: 0, skipped: 0, finalized: 0, alreadyRan: true };
  }

  const result = await runDailyAttendanceProcessing(options);

  if (isPastTimeCutoff(now, latest, date)) {
    await setAutoAbsenceLastRunDate(date);
  }

  return {
    date: result.date,
    marked: result.markedAbsent,
    eligible: result.eligibleAbsent,
    skipped: result.skipped,
    finalized: result.finalizedSessions,
    alreadyRan: result.alreadyRan,
  };
}
