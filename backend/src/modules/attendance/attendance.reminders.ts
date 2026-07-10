import { todayDateString } from "../../utils/date";
import { getSettings } from "../settings/settings.cache";
import { normalizeWeeklyOffDays, resolveWeeklyOffDays } from "../../utils/weeklyOffDays";
import * as employeesRepo from "../employees/employees.repository";
import * as holidaysRepo from "../holidays/holidays.repository";
import { resolveHolidaysInRange } from "../holidays/holidays.service";
import * as attendanceRepo from "./attendance.repository";
import { getEffectiveClosingTimesForEmployees } from "./attendanceRules.service";
import { isPastTimeCutoff } from "../../services/autoAbsence.service";
import { resolveDayStatus } from "./attendanceCalculation.service";
import type { MonthlyCellStatus } from "./attendance.monthly";

export interface ReminderRecipient {
  id: string;
  name: string;
  employee_code: string;
}

/** Employees who should check in today but have not yet (excludes leave, holiday, weekly off). */
export function isEligibleForAttendanceReminder(status: MonthlyCellStatus): boolean {
  return status === "none";
}

export async function listEmployeesEligibleForAttendanceReminder(
  date: string = todayDateString()
): Promise<ReminderRecipient[]> {
  const defaultWeeklyOffDays = normalizeWeeklyOffDays(getSettings().weeklyOff.defaultWeeklyOffDays);
  const employees = await employeesRepo.listActiveEmployeesForGrid();
  const employeeIds = employees.map((employee) => employee.id);

  const [attendanceRows, leaveRows, holidayRows, closingByEmployee] = await Promise.all([
    attendanceRepo.listAttendanceInRange(date, date),
    attendanceRepo.listApprovedLeavesInRange(date, date),
    holidaysRepo.listHolidaysForRange(date, date),
    getEffectiveClosingTimesForEmployees(date, employeeIds),
  ]);

  const holidayMap = resolveHolidaysInRange(holidayRows, date, date);
  const attendanceByEmployee = new Map(attendanceRows.map((row) => [row.employee_id, row]));
  const leaveSet = new Set(leaveRows.map((row) => `${row.employee_id}|${row.leave_date}`));
  const now = new Date();
  const isToday = date === todayDateString();
  const weekday = new Date(`${date}T12:00:00`).getDay();

  const eligible: ReminderRecipient[] = [];

  for (const employee of employees) {
    const weeklyOff = resolveWeeklyOffDays(employee, defaultWeeklyOffDays);
    const record = attendanceByEmployee.get(employee.id) ?? null;
    const closingTime = closingByEmployee.get(employee.id);
    const isPastClosingCutoff =
      !isToday || (closingTime ? isPastTimeCutoff(now, closingTime, date) : false);

    const status = resolveDayStatus({
      record,
      hasLeave: leaveSet.has(`${employee.id}|${date}`),
      isHoliday: holidayMap.has(date),
      isWeeklyOff: weeklyOff.includes(weekday),
      isFuture: date > todayDateString(),
      isToday,
      isPastClosingCutoff,
    });

    if (isEligibleForAttendanceReminder(status)) {
      eligible.push({
        id: employee.id,
        name: employee.name,
        employee_code: employee.employee_code,
      });
    }
  }

  return eligible;
}
