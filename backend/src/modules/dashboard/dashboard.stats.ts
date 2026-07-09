import { pool } from "../../config/db";
import { todayDateString } from "../../utils/date";
import { getSettings } from "../settings/settings.cache";
import { normalizeWeeklyOffDays, resolveWeeklyOffDays } from "../../utils/weeklyOffDays";
import * as employeesRepo from "../employees/employees.repository";
import * as holidaysRepo from "../holidays/holidays.repository";
import { resolveHolidaysInRange } from "../holidays/holidays.service";
import * as attendanceRepo from "../attendance/attendance.repository";
import { getEffectiveClosingTimesForEmployees } from "../attendance/attendanceRules.service";
import { isPastTimeCutoff } from "../../services/autoAbsence.service";
import {
  dashboardBucketFromStatus,
  resolveDayStatus,
} from "../attendance/attendanceCalculation.service";

export interface DashboardSummaryResult {
  totalEmployees: number;
  presentToday: number;
  halfDayToday: number;
  absentToday: number;
  lateArrivals: number;
  currentlyCheckedIn: number;
  checkedOutToday: number;
  holidayWorkedToday: number;
  weeklyOffWorkedToday: number;
}

/**
 * Classifies an active employee's attendance for a single day.
 * Each employee falls into exactly one of: present, half_day, or absent buckets.
 */
export function classifyEmployeeDayBucket(record: {
  status: string | null;
  day_status: string | null;
  check_in_status: string | null;
  is_half_day: boolean | null;
} | null): "present" | "half_day" | "absent" {
  if (!record) return "absent";

  const status = record.status;
  const dayStatus = record.day_status;
  const checkInStatus = record.check_in_status;
  const isHalfDay = Boolean(record.is_half_day);

  if (status === "absent" || dayStatus === "absent") {
    return "absent";
  }

  if (dayStatus === "half_day") {
    return "half_day";
  }

  if (dayStatus === "present") {
    return "present";
  }

  if (status === "checked_in" && dayStatus == null) {
    if (isHalfDay || checkInStatus === "half_day") {
      return "half_day";
    }
    return "present";
  }

  return "absent";
}

export function isLateArrival(record: {
  status: string | null;
  check_in_status: string | null;
  is_admin_marked: boolean | null;
  check_in_time: Date | string | null;
} | null): boolean {
  if (!record?.check_in_time) return false;
  if (record.status === "absent") return false;
  if (record.is_admin_marked) return false;
  return record.check_in_status === "late";
}

export async function getDashboardSummary(today: string): Promise<DashboardSummaryResult> {
  const date = today ?? todayDateString();
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

  let presentToday = 0;
  let halfDayToday = 0;
  let absentToday = 0;
  let holidayWorkedToday = 0;
  let weeklyOffWorkedToday = 0;
  let lateArrivals = 0;
  let currentlyCheckedIn = 0;
  let checkedOutToday = 0;

  for (const employee of employees) {
    const weeklyOff = resolveWeeklyOffDays(employee, defaultWeeklyOffDays);
    const weekday = new Date(`${date}T12:00:00`).getDay();
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

    const bucket = dashboardBucketFromStatus(status);
    if (bucket === "present") presentToday += 1;
    else if (bucket === "half_day") halfDayToday += 1;
    else if (bucket === "absent") absentToday += 1;

    if (status === "holiday_worked") holidayWorkedToday += 1;
    if (status === "weekly_off_worked") weeklyOffWorkedToday += 1;

    if (record?.status === "checked_in") currentlyCheckedIn += 1;
    if (record?.status === "checked_out") checkedOutToday += 1;
    if (isLateArrival(record)) lateArrivals += 1;
  }

  return {
    totalEmployees: employees.length,
    presentToday,
    halfDayToday,
    absentToday,
    lateArrivals,
    currentlyCheckedIn,
    checkedOutToday,
    holidayWorkedToday,
    weeklyOffWorkedToday,
  };
}

export async function listTodayAttendanceWithEmployees(today: string) {
  const result = await pool.query(
    `SELECT
       a.*,
       e.employee_code, e.name AS employee_name,
       s.name AS site_name
     FROM attendance a
     JOIN employees e ON e.id = a.employee_id
     LEFT JOIN sites s ON s.id = a.site_id
     WHERE a.attendance_date = $1
       AND e.role = 'employee'
       AND e.is_active = true
       AND e.deleted_at IS NULL
     ORDER BY COALESCE(a.check_out_time, a.check_in_time) DESC NULLS LAST, e.name ASC`,
    [today]
  );
  return result.rows;
}
