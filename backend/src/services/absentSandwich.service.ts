import {
  ABSENT_SANDWICH_REASON,
  applyAbsentSandwichRule,
  SANDWICH_OFF_STATUSES,
} from "../modules/attendance/attendanceCalculation.service";
import {
  listAbsentSandwichTargetDates,
  shiftDateString,
} from "../modules/attendance/attendance.monthly";
import * as attendanceRepo from "../modules/attendance/attendance.repository";

const SANDWICH_SYNC_PAD_DAYS = 31;

/**
 * Recalculates the Absent Sandwich Rule for an employee around an edited date
 * and upserts/deletes sandwich absent rows so records + reports stay in sync
 * with the monthly calendar.
 */
export async function syncAbsentSandwichForEmployee(
  employeeId: string,
  aroundDate: string
): Promise<{ applied: number; removed: number }> {
  const from = shiftDateString(aroundDate, -SANDWICH_SYNC_PAD_DAYS);
  const to = shiftDateString(aroundDate, SANDWICH_SYNC_PAD_DAYS);

  const sandwichDates = await listAbsentSandwichTargetDates({
    employeeId,
    from,
    to,
  });

  const applied = await attendanceRepo.upsertSandwichAbsentRecords(
    employeeId,
    sandwichDates
  );
  const removed = await attendanceRepo.deleteStaleSandwichAbsentRecords(
    employeeId,
    from,
    to,
    sandwichDates
  );

  return { applied, removed };
}

/** Sync sandwich rule for many employees (e.g. after bulk manual attendance). */
export async function syncAbsentSandwichForEmployees(
  employeeIds: string[],
  aroundDate: string
): Promise<void> {
  const unique = Array.from(new Set(employeeIds));
  for (const employeeId of unique) {
    await syncAbsentSandwichForEmployee(employeeId, aroundDate);
  }
}

export { ABSENT_SANDWICH_REASON, applyAbsentSandwichRule, SANDWICH_OFF_STATUSES };
