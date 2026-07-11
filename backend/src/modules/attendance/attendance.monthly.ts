import { employeeJoinDate, toDateString } from "../../utils/date";
import { getSettings } from "../settings/settings.cache";
import { normalizeWeeklyOffDays, resolveWeeklyOffDays } from "../../utils/weeklyOffDays";
import * as repo from "./attendance.repository";
import * as employeesRepo from "../employees/employees.repository";
import * as holidaysRepo from "../holidays/holidays.repository";
import { resolveHolidaysInRange } from "../holidays/holidays.service";
import {
  buildSummaryFromDays,
  resolveDayStatus,
  WORKED_MINUTE_STATUSES,
} from "./attendanceCalculation.service";
import { getEffectiveClosingTimesForEmployees } from "./attendanceRules.service";
import { isPastTimeCutoff } from "../../services/autoAbsence.service";

export type MonthlyCellStatus =
  | "present"
  | "half_day"
  | "absent"
  | "leave"
  | "weekly_off"
  | "holiday"
  | "holiday_worked"
  | "weekly_off_worked"
  | "none"
  | "not_applicable";

export interface MonthlyDayCell {
  day: number;
  date: string;
  status: MonthlyCellStatus;
  totalMinutes: number | null;
  late: boolean;
  holidayName: string | null;
}

export interface MonthlySummary {
  present: number;
  halfDay: number;
  absent: number;
  leave: number;
  weeklyOff: number;
  holidays: number;
  holidayWorked: number;
  weeklyOffWorked: number;
  totalMinutes: number;
  workingDays: number;
  attendancePercentage: number;
  lateCheckIns: number;
}

export interface MonthlyEmployeeRow {
  employeeId: string;
  employeeCode: string;
  name: string;
  department: string | null;
  designation: string | null;
  weeklyOffDays: number[];
  days: MonthlyDayCell[];
  summary: MonthlySummary;
}

export interface MonthlyGrid {
  year: number;
  month: number; // 1-12
  label: string;
  daysInMonth: number;
  defaultWeeklyOffDays: number[];
  employees: MonthlyEmployeeRow[];
  holidays: { date: string; name: string; description: string | null }[];
}

export interface AttendanceRangeGrid {
  from: string;
  to: string;
  label: string;
  defaultWeeklyOffDays: number[];
  employees: MonthlyEmployeeRow[];
  holidays: { date: string; name: string; description: string | null }[];
}

/** Parses a "YYYY-MM" string, defaulting to the current month. */
export function resolveMonth(monthParam?: string): { year: number; month: number } {
  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [y, m] = monthParam.split("-").map(Number);
    if (m >= 1 && m <= 12) return { year: y, month: m };
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function weekdayForDate(dateStr: string): number {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day).getDay();
}

function enumerateDates(from: string, to: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  while (cursor <= end) {
    dates.push(toDateString(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function buildDayCell(input: {
  dateStr: string;
  record: any | undefined;
  weeklyOff: number[];
  holidayMap: Map<string, { name: string; description: string | null }>;
  leaveSet: Set<string>;
  employeeId: string;
  joinDate: string;
  todayStr: string;
  now: Date;
  closingTime: { hour: number; minute: number } | undefined;
}): MonthlyDayCell {
  const {
    dateStr,
    record,
    weeklyOff,
    holidayMap,
    leaveSet,
    employeeId,
    joinDate,
    todayStr,
    now,
    closingTime,
  } = input;
  const day = Number(dateStr.slice(-2));

  // Pre-join days default to not_applicable, but any saved attendance (including
  // admin manual edits) must still resolve so calendar edits are visible.
  if (dateStr < joinDate && !record) {
    return {
      day,
      date: dateStr,
      status: "not_applicable",
      totalMinutes: null,
      late: false,
      holidayName: null,
    };
  }

  const weekday = weekdayForDate(dateStr);
  const key = `${employeeId}|${dateStr}`;
  const isFuture = dateStr > todayStr;
  const isToday = dateStr === todayStr;
  const isWeeklyOff = weeklyOff.includes(weekday);
  const holidayInfo = holidayMap.get(dateStr);
  const isHoliday = Boolean(holidayInfo);
  const isPastClosingCutoff =
    !isToday || (closingTime ? isPastTimeCutoff(now, closingTime, todayStr) : false);

  const status = resolveDayStatus({
    record: record ?? null,
    hasLeave: leaveSet.has(key),
    isHoliday,
    isWeeklyOff,
    isFuture,
    isToday,
    isPastClosingCutoff,
  });

  let totalMinutes: number | null = null;
  let late = false;
  if (record) {
    if (WORKED_MINUTE_STATUSES.has(status)) {
      totalMinutes = record.total_minutes ?? null;
    }
    late =
      record.check_in_status === "late" &&
      !record.is_admin_marked &&
      Boolean(record.check_in_time);
  }

  return {
    day,
    date: dateStr,
    status,
    totalMinutes,
    late,
    holidayName: holidayInfo?.name ?? null,
  };
}

async function loadGridContext(
  from: string,
  to: string,
  employeeId?: string,
  siteId?: string,
  sort: "oldest" | "newest" = "oldest"
) {
  const todayStr = toDateString(new Date());
  const defaultWeeklyOffDays = normalizeWeeklyOffDays(getSettings().weeklyOff.defaultWeeklyOffDays);
  const employees = await employeesRepo.listActiveEmployeesForGrid(employeeId, sort);
  const attendanceRows = await repo.listAttendanceInRange(from, to, employeeId, siteId);
  const leaveRows = await repo.listApprovedLeavesInRange(from, to, employeeId);
  const holidayRows = await holidaysRepo.listHolidaysForRange(from, to);
  const holidayMap = resolveHolidaysInRange(holidayRows, from, to);
  const holidaysList = Array.from(holidayMap.values())
    .sort((a, b) => a.holiday_date.localeCompare(b.holiday_date))
    .map((h) => ({ date: h.holiday_date, name: h.name, description: h.description }));

  const attendanceMap = new Map<string, any>();
  for (const row of attendanceRows) {
    attendanceMap.set(`${row.employee_id}|${row.attendance_date}`, row);
  }
  const leaveSet = new Set<string>();
  for (const row of leaveRows) {
    leaveSet.add(`${row.employee_id}|${row.leave_date}`);
  }

  const closingByEmployee = await getEffectiveClosingTimesForEmployees(
    todayStr,
    employees.map((emp) => emp.id)
  );

  return {
    todayStr,
    now: new Date(),
    defaultWeeklyOffDays,
    employees,
    holidayMap,
    holidaysList,
    attendanceMap,
    leaveSet,
    closingByEmployee,
  };
}

/** Builds attendance grid for an arbitrary date range — shared by monthly, scoreboard, and reports. */
export async function buildAttendanceGridForRange(params: {
  from: string;
  to: string;
  employeeId?: string;
  siteId?: string;
  sort?: "oldest" | "newest";
}): Promise<AttendanceRangeGrid> {
  const { from, to } = params;
  const ctx = await loadGridContext(from, to, params.employeeId, params.siteId, params.sort ?? "oldest");
  const dates = enumerateDates(from, to);

  const rows: MonthlyEmployeeRow[] = ctx.employees.map((emp) => {
    const weeklyOff = resolveWeeklyOffDays(emp, ctx.defaultWeeklyOffDays);
    const closingTime = ctx.closingByEmployee.get(emp.id);
    const days = dates.map((dateStr) =>
      buildDayCell({
        dateStr,
        record: ctx.attendanceMap.get(`${emp.id}|${dateStr}`),
        weeklyOff,
        holidayMap: ctx.holidayMap,
        leaveSet: ctx.leaveSet,
        employeeId: emp.id,
        joinDate: employeeJoinDate(emp.created_at),
        todayStr: ctx.todayStr,
        now: ctx.now,
        closingTime,
      })
    );

    return {
      employeeId: emp.id,
      employeeCode: emp.employee_code,
      name: emp.name,
      department: emp.department ?? null,
      designation: emp.designation ?? null,
      weeklyOffDays: weeklyOff,
      days,
      summary: buildSummaryFromDays(days, ctx.todayStr),
    };
  });

  return {
    from,
    to,
    label: `${from} to ${to}`,
    defaultWeeklyOffDays: ctx.defaultWeeklyOffDays,
    employees: rows,
    holidays: ctx.holidaysList,
  };
}

export async function buildMonthlyGrid(params: {
  year: number;
  month: number;
  employeeId?: string;
  siteId?: string;
  sort?: "oldest" | "newest";
}): Promise<MonthlyGrid> {
  const { year, month } = params;
  const daysInMonth = new Date(year, month, 0).getDate();
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const to = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

  const rangeGrid = await buildAttendanceGridForRange({
    from,
    to,
    employeeId: params.employeeId,
    siteId: params.siteId,
    sort: params.sort ?? "oldest",
  });

  return {
    year,
    month,
    label: `${MONTH_NAMES[month - 1]} ${year}`,
    daysInMonth,
    defaultWeeklyOffDays: rangeGrid.defaultWeeklyOffDays,
    employees: rangeGrid.employees,
    holidays: rangeGrid.holidays,
  };
}

export function monthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}
