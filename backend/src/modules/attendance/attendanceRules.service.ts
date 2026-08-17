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
import {
  findStandingScheduleForEmployee,
  findStandingSchedulesForEmployees,
} from "../employees/employees.repository";

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

/**
 * A layer of the schedule-resolution fallback chain: any object with some or
 * all of these fields set. A field left null/undefined means "inherit from
 * the next tier down" — never "zero"/"blank". Both AttendanceDailyOverride
 * (date-range overrides) and StandingAttendanceScheduleFields (the standing
 * per-employee schedule) satisfy this shape structurally.
 */
export interface ScheduleLayer {
  officeStartTime?: string | null;
  lateCheckInTime?: string | null;
  halfDayCutoff?: string | null;
  officeClosingTime?: string | null;
  minHoursPresent?: number | null;
  minHoursHalfDay?: number | null;
}

/** Merges one schedule layer over a base, field by field — null/undefined fields fall through. */
function mergeScheduleLayer(base: AttendanceSettings, layer: ScheduleLayer | null): AttendanceSettings {
  if (!layer) return base;
  return {
    ...base,
    officeStartTime: layer.officeStartTime ?? base.officeStartTime,
    lateCheckInTime: layer.lateCheckInTime ?? base.lateCheckInTime,
    halfDayCutoff: layer.halfDayCutoff ?? base.halfDayCutoff,
    officeClosingTime: layer.officeClosingTime ?? base.officeClosingTime,
    minHoursPresent: layer.minHoursPresent ?? base.minHoursPresent,
    minHoursHalfDay: layer.minHoursHalfDay ?? base.minHoursHalfDay,
  };
}

/**
 * Resolves effective attendance settings through the full fallback chain:
 *   date-range override (if active today) > standing per-employee schedule > global default.
 * `buildEffectiveRulesFromOverrideRow` stays synchronous and pure (the override
 * row and standing schedule are both fetched by the caller) so it stays easy to
 * unit test without a database — see attendanceRules.service.test.ts.
 */
export function buildEffectiveRulesFromOverrideRow(
  row: AttendanceDailyOverrideRow | null,
  date: string,
  standingSchedule: ScheduleLayer | null = null
): EffectiveAttendanceRules {
  const withStanding = normalizeAttendanceSettings(
    mergeScheduleLayer(getSettings().attendance, standingSchedule)
  );

  if (!isOverrideActiveForDate(row, date)) {
    return { settings: withStanding, activeOverride: null };
  }

  const override = mapOverrideRow(row);
  const merged = normalizeAttendanceSettings(mergeScheduleLayer(withStanding, override));

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
  const [row, standingSchedule] = await Promise.all([
    repo.findOverrideForEmployeeAndDate(employeeId, date),
    findStandingScheduleForEmployee(employeeId),
  ]);
  return buildEffectiveRulesFromOverrideRow(row, date, standingSchedule);
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
  employeesByOverride: Map<string, OverrideEmployeeSummary[]>,
  standingSchedule: ScheduleLayer | null
): TimeOfDay {
  const defaults = defaultClosingTime();
  const standingClosing = standingSchedule?.officeClosingTime
    ? parseClosingTime(standingSchedule.officeClosingTime)
    : defaults;

  const row = pickOverrideForEmployee(employeeId, date, overrides, employeesByOverride);
  if (!row) return standingClosing;
  if (row.office_closing_time) return parseClosingTime(row.office_closing_time);
  return standingClosing;
}

/** Per-employee effective closing times for auto-absence (respects standing schedules and daily overrides). */
export async function getEffectiveClosingTimesForEmployees(
  date: string,
  employeeIds: string[]
): Promise<Map<string, TimeOfDay>> {
  const [{ rows, employeesByOverride }, standingSchedules] = await Promise.all([
    repo.listEnabledOverridesForDate(date),
    findStandingSchedulesForEmployees(employeeIds),
  ]);
  const map = new Map<string, TimeOfDay>();
  for (const employeeId of employeeIds) {
    map.set(
      employeeId,
      effectiveClosingTimeForEmployee(
        employeeId,
        date,
        rows,
        employeesByOverride,
        standingSchedules.get(employeeId) ?? null
      )
    );
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
