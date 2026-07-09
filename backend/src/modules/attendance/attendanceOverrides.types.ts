export interface AttendanceDailyOverrideRow {
  id: string;
  start_date: string;
  end_date: string;
  reason: string;
  office_start_time: string | null;
  late_check_in_time: string | null;
  half_day_cutoff: string | null;
  office_closing_time: string | null;
  min_hours_present: number | null;
  min_hours_half_day: number | null;
  is_enabled: boolean;
  apply_to_all: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface OverrideEmployeeSummary {
  id: string;
  employeeCode: string;
  name: string;
}

export interface AttendanceDailyOverride {
  id: string;
  startDate: string;
  endDate: string;
  reason: string;
  officeStartTime: string | null;
  lateCheckInTime: string | null;
  halfDayCutoff: string | null;
  officeClosingTime: string | null;
  minHoursPresent: number | null;
  minHoursHalfDay: number | null;
  isEnabled: boolean;
  applyToAll: boolean;
  employees: OverrideEmployeeSummary[];
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ActiveAttendanceOverrideNotice {
  id: string;
  startDate: string;
  endDate: string;
  reason: string;
}

export type AttendanceOverrideCalendarStatus = "active" | "upcoming" | "expired";

export function calendarStatusForOverride(
  row: Pick<AttendanceDailyOverrideRow, "start_date" | "end_date">,
  today: string
): AttendanceOverrideCalendarStatus {
  if (row.end_date < today) return "expired";
  if (row.start_date > today) return "upcoming";
  return "active";
}

export function mapOverrideRow(
  row: AttendanceDailyOverrideRow,
  employees: OverrideEmployeeSummary[] = []
): AttendanceDailyOverride {
  return {
    id: row.id,
    startDate: row.start_date,
    endDate: row.end_date,
    reason: row.reason,
    officeStartTime: row.office_start_time,
    lateCheckInTime: row.late_check_in_time,
    halfDayCutoff: row.half_day_cutoff,
    officeClosingTime: row.office_closing_time,
    minHoursPresent: row.min_hours_present !== null ? Number(row.min_hours_present) : null,
    minHoursHalfDay: row.min_hours_half_day !== null ? Number(row.min_hours_half_day) : null,
    isEnabled: row.is_enabled,
    applyToAll: row.apply_to_all,
    employees,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
