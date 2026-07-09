import * as employeesRepo from "../employees/employees.repository";
import * as holidaysRepo from "../holidays/holidays.repository";
import { resolveHolidaysInRange } from "../holidays/holidays.service";
import { resolveWeeklyOffDays } from "../../utils/weeklyOffDays";
import type { SpecialDayStatus } from "../../types";

export interface OffDayContext {
  isWeeklyOff: boolean;
  isHoliday: boolean;
  holidayName: string | null;
  requiresConfirmation: boolean;
  confirmationType: "weekly_off" | "holiday" | null;
  specialDayStatus: SpecialDayStatus | null;
}

function weekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

/** Resolves whether a date is a weekly off or company holiday for an employee. */
export async function resolveOffDayContext(
  employeeId: string,
  date: string
): Promise<OffDayContext> {
  const employee = await employeesRepo.findEmployeeById(employeeId);
  const weeklyOffDays = employee ? resolveWeeklyOffDays(employee) : [];
  const weekday = weekdayOf(date);
  const isWeeklyOff = weeklyOffDays.includes(weekday);

  const holidayRows = await holidaysRepo.listHolidaysForRange(date, date);
  const holidayMap = resolveHolidaysInRange(holidayRows, date, date);
  const holidayInfo = holidayMap.get(date);
  const isHoliday = Boolean(holidayInfo);

  let confirmationType: "weekly_off" | "holiday" | null = null;
  let specialDayStatus: SpecialDayStatus | null = null;

  if (isHoliday) {
    confirmationType = "holiday";
    specialDayStatus = "holiday_worked";
  } else if (isWeeklyOff) {
    confirmationType = "weekly_off";
    specialDayStatus = "weekly_off_worked";
  }

  return {
    isWeeklyOff,
    isHoliday,
    holidayName: holidayInfo?.name ?? null,
    requiresConfirmation: confirmationType !== null,
    confirmationType,
    specialDayStatus,
  };
}
