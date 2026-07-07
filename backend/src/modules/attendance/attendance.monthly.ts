import { toDateString } from "../../utils/date";
import * as repo from "./attendance.repository";
import * as employeesRepo from "../employees/employees.repository";
import * as holidaysRepo from "../holidays/holidays.repository";
import { resolveHolidaysInRange } from "../holidays/holidays.service";

export type MonthlyCellStatus =
  | "present"
  | "half_day"
  | "absent"
  | "leave"
  | "weekly_off"
  | "holiday"
  | "holiday_worked"
  | "none";

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
  weeklyOffDays: number[];
  days: MonthlyDayCell[];
  summary: MonthlySummary;
}

export interface MonthlyGrid {
  year: number;
  month: number; // 1-12
  label: string;
  daysInMonth: number;
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

/** Derives a day cell's status from the attendance record's stored day_status. */
function statusFromRecord(record: any): MonthlyCellStatus {
  if (record.day_status === "present") return "present";
  if (record.day_status === "half_day") return "half_day";
  if (record.day_status === "absent") return "absent";
  // Still checked in (no checkout yet) — treat as present for the day.
  if (record.status === "checked_in") return "present";
  if (record.status === "absent") return "absent";
  return "present";
}

export async function buildMonthlyGrid(params: {
  year: number;
  month: number;
  employeeId?: string;
  siteId?: string;
}): Promise<MonthlyGrid> {
  const { year, month } = params;
  const daysInMonth = new Date(year, month, 0).getDate();
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const to = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
  const todayStr = toDateString(new Date());

  const employees = await employeesRepo.listActiveEmployeesForGrid(params.employeeId);
  const attendanceRows = await repo.listAttendanceInRange(from, to, params.employeeId, params.siteId);
  const leaveRows = await repo.listApprovedLeavesInRange(from, to, params.employeeId);
  const holidayRows = await holidaysRepo.listHolidaysForRange(from, to);
  const holidayMap = resolveHolidaysInRange(holidayRows, from, to);
  const holidaysList = Array.from(holidayMap.values())
    .sort((a, b) => a.holiday_date.localeCompare(b.holiday_date))
    .map((h) => ({ date: h.holiday_date, name: h.name, description: h.description }));

  // Index attendance + leave by "employeeId|date".
  const attendanceMap = new Map<string, any>();
  for (const row of attendanceRows) {
    attendanceMap.set(`${row.employee_id}|${row.attendance_date}`, row);
  }
  const leaveSet = new Set<string>();
  for (const row of leaveRows) {
    leaveSet.add(`${row.employee_id}|${row.leave_date}`);
  }

  const rows: MonthlyEmployeeRow[] = employees.map((emp) => {
    const weeklyOff = emp.weekly_off_days ?? [];
    const days: MonthlyDayCell[] = [];
    const summary: MonthlySummary = {
      present: 0,
      halfDay: 0,
      absent: 0,
      leave: 0,
      weeklyOff: 0,
      holidays: 0,
      holidayWorked: 0,
      totalMinutes: 0,
      workingDays: 0,
      attendancePercentage: 0,
      lateCheckIns: 0,
    };

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const weekday = new Date(year, month - 1, day).getDay();
      const key = `${emp.id}|${dateStr}`;
      const record = attendanceMap.get(key);
      const isFuture = dateStr > todayStr;
      const isWeeklyOff = weeklyOff.includes(weekday);
      const holidayInfo = holidayMap.get(dateStr);
      const isHoliday = Boolean(holidayInfo);

      let status: MonthlyCellStatus;
      let totalMinutes: number | null = null;
      let late = false;

      if (record && isHoliday) {
        status = "holiday_worked";
        totalMinutes = record.total_minutes ?? null;
        late = record.check_in_status === "late";
      } else if (record) {
        status = statusFromRecord(record);
        totalMinutes = record.total_minutes ?? null;
        late = record.check_in_status === "late";
      } else if (leaveSet.has(key)) {
        status = "leave";
      } else if (isHoliday) {
        status = "holiday";
      } else if (isWeeklyOff) {
        status = "weekly_off";
      } else if (isFuture) {
        status = "none";
      } else {
        status = "absent";
      }

      switch (status) {
        case "present":
          summary.present += 1;
          break;
        case "half_day":
          summary.halfDay += 1;
          break;
        case "absent":
          summary.absent += 1;
          break;
        case "leave":
          summary.leave += 1;
          break;
        case "weekly_off":
          summary.weeklyOff += 1;
          break;
        case "holiday":
          summary.holidays += 1;
          break;
        case "holiday_worked":
          summary.holidayWorked += 1;
          break;
      }
      if (totalMinutes) summary.totalMinutes += totalMinutes;
      if (late) summary.lateCheckIns += 1;

      days.push({
        day,
        date: dateStr,
        status,
        totalMinutes,
        late,
        holidayName: holidayInfo?.name ?? null,
      });
    }

    // Working days = days attendance was expected (present + half + absent).
    summary.workingDays = summary.present + summary.halfDay + summary.absent;
    summary.attendancePercentage =
      summary.workingDays > 0
        ? Math.round(
            ((summary.present + summary.halfDay * 0.5 + summary.holidayWorked) / summary.workingDays) * 1000
          ) / 10
        : 0;

    return {
      employeeId: emp.id,
      employeeCode: emp.employee_code,
      name: emp.name,
      department: emp.department ?? null,
      weeklyOffDays: weeklyOff,
      days,
      summary,
    };
  });

  return {
    year,
    month,
    label: `${MONTH_NAMES[month - 1]} ${year}`,
    daysInMonth,
    employees: rows,
    holidays: holidaysList,
  };
}

export function monthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}
