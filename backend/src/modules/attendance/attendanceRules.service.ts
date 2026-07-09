import { getSettings } from "../settings/settings.cache";
import type { AttendanceSettings } from "../settings/settings.types";
import { normalizeAttendanceSettings } from "../../utils/settingsHelpers";
import type {
  ActiveAttendanceOverrideNotice,
  AttendanceDailyOverride,
  AttendanceDailyOverrideRow,
  OverrideEmployeeSummary,
} from "./attendanceOverrides.types";
import { mapOverrideRow } from "./attendanceOverrides.types";
import * as repo from "./attendanceOverrides.repository";

export type EffectiveAttendanceSettings = ReturnType<typeof normalizeAttendanceSettings>;

export interface EffectiveAttendanceRules {
  settings: EffectiveAttendanceSettings;
  activeOverride: ActiveAttendanceOverrideNotice | null;
}

export interface TimeOfDay {
  hour: number;
  minute: number;
}

export interface AutoAbsenceCutoffBounds {
  earliest: TimeOfDay;
  latest: TimeOfDay;
}

/** True when an override row is enabled and the date falls within its range. */
export function isOverrideActiveForDate(
  row: AttendanceDailyOverrideRow | null | undefined,
  date: string
): row is AttendanceDailyOverrideRow {
  if (!row || !row.is_enabled) return false;
  return row.start_date <= date && row.end_date >= date;
}

function mergeOverrideIntoDefaults(
  defaults: AttendanceSettings,
  override: AttendanceDailyOverride
): AttendanceSettings {
  return {
    ...defaults,
    officeStartTime: override.officeStartTime ?? defaults.officeStartTime,
    lateCheckInTime: override.lateCheckInTime ?? defaults.lateCheckInTime,
    halfDayCutoff: override.halfDayCutoff ?? defaults.halfDayCutoff,
    officeClosingTime: override.officeClosingTime ?? defaults.officeClosingTime,
    minHoursPresent: override.minHoursPresent ?? defaults.minHoursPresent,
    minHoursHalfDay: override.minHoursHalfDay ?? defaults.minHoursHalfDay,
    checkinOpenTime: override.officeStartTime ?? defaults.checkinOpenTime,
    checkinOntimeEnd: override.lateCheckInTime ?? defaults.checkinOntimeEnd,
  };
}

export function buildEffectiveRulesFromOverrideRow(
  row: AttendanceDailyOverrideRow | null,
  date: string
): EffectiveAttendanceRules {
  const defaults = normalizeAttendanceSettings(getSettings().attendance);
  if (!isOverrideActiveForDate(row, date)) {
    return { settings: defaults, activeOverride: null };
  }

  const override = mapOverrideRow(row);
  const merged = normalizeAttendanceSettings(
    mergeOverrideIntoDefaults(getSettings().attendance, override)
  );

  return {
    settings: merged,
    activeOverride: {
      id: override.id,
      startDate: override.startDate,
      endDate: override.endDate,
      reason: override.reason,
    },
  };
}

export async function getEffectiveAttendanceRules(
  date: string,
  employeeId?: string | null
): Promise<EffectiveAttendanceRules> {
  if (!employeeId) {
    return buildEffectiveRulesFromOverrideRow(null, date);
  }
  const row = await repo.findOverrideForEmployeeAndDate(employeeId, date);
  return buildEffectiveRulesFromOverrideRow(row, date);
}

export async function assertNoAssignmentConflict(
  startDate: string,
  endDate: string,
  applyToAll: boolean,
  employeeIds: string[],
  excludeId?: string
): Promise<void> {
  const conflicts = await repo.hasAssignmentConflict(
    startDate,
    endDate,
    applyToAll,
    employeeIds,
    excludeId
  );
  if (conflicts) {
    throw new Error(
      "An active override already covers one or more of these dates for the selected employees"
    );
  }
}

export function parseClosingTime(time: string): TimeOfDay {
  const [hour, minute] = time.split(":").map(Number);
  return { hour: hour ?? 17, minute: minute ?? 0 };
}

export function timeOfDayToMinutes(time: TimeOfDay): number {
  return time.hour * 60 + time.minute;
}

function defaultClosingTime(): TimeOfDay {
  return parseClosingTime(normalizeAttendanceSettings(getSettings().attendance).officeClosingTime);
}

export function pickOverrideForEmployee(
  employeeId: string,
  date: string,
  overrides: AttendanceDailyOverrideRow[],
  employeesByOverride: Map<string, OverrideEmployeeSummary[]>
): AttendanceDailyOverrideRow | null {
  for (const row of overrides) {
    if (!isOverrideActiveForDate(row, date)) continue;
    if (row.apply_to_all) return row;
    const employees = employeesByOverride.get(row.id) ?? [];
    if (employees.some((employee) => employee.id === employeeId)) return row;
  }
  return null;
}

function effectiveClosingTimeForEmployee(
  employeeId: string,
  date: string,
  overrides: AttendanceDailyOverrideRow[],
  employeesByOverride: Map<string, OverrideEmployeeSummary[]>
): TimeOfDay {
  const defaults = defaultClosingTime();
  const row = pickOverrideForEmployee(employeeId, date, overrides, employeesByOverride);
  if (!row) return defaults;
  if (row.office_closing_time) return parseClosingTime(row.office_closing_time);
  return defaults;
}

/** Per-employee effective closing times for auto-absence (respects daily overrides). */
export async function getEffectiveClosingTimesForEmployees(
  date: string,
  employeeIds: string[]
): Promise<Map<string, TimeOfDay>> {
  const { rows, employeesByOverride } = await repo.listEnabledOverridesForDate(date);
  const map = new Map<string, TimeOfDay>();
  for (const employeeId of employeeIds) {
    map.set(employeeId, effectiveClosingTimeForEmployee(employeeId, date, rows, employeesByOverride));
  }
  return map;
}

export function getAutoAbsenceCutoffBounds(
  closingByEmployee: Map<string, TimeOfDay>
): AutoAbsenceCutoffBounds {
  const fallback = defaultClosingTime();
  if (closingByEmployee.size === 0) {
    return { earliest: fallback, latest: fallback };
  }

  let earliest = { hour: 23, minute: 59 };
  let latest = { hour: 0, minute: 0 };

  for (const time of closingByEmployee.values()) {
    if (timeOfDayToMinutes(time) < timeOfDayToMinutes(earliest)) earliest = time;
    if (timeOfDayToMinutes(time) > timeOfDayToMinutes(latest)) latest = time;
  }

  return { earliest, latest };
}
