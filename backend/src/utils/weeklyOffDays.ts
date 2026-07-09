import { getSettings } from "../modules/settings/settings.cache";

/** Normalize weekday arrays (0=Sun .. 6=Sat) for stable comparison and storage. */
export function normalizeWeeklyOffDays(days: number[]): number[] {
  return Array.from(new Set(days)).sort((a, b) => a - b);
}

export function weeklyOffDaysEqual(a: number[], b: number[]): boolean {
  const left = normalizeWeeklyOffDays(a);
  const right = normalizeWeeklyOffDays(b);
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function formatWeeklyOffDays(days: number[], labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]): string {
  const normalized = normalizeWeeklyOffDays(days);
  if (normalized.length === 0) return "No weekly off";
  return normalized.map((day) => labels[day] ?? String(day)).join(", ");
}

export interface WeeklyOffEmployeeLike {
  weekly_off_days?: number[] | null;
  uses_default_weekly_off?: boolean | null;
}

/** Resolve effective weekly off: default from settings unless employee has a custom schedule. */
export function resolveWeeklyOffDays(
  employee: WeeklyOffEmployeeLike,
  defaultDays?: number[]
): number[] {
  const defaults = normalizeWeeklyOffDays(
    defaultDays ?? getSettings().weeklyOff.defaultWeeklyOffDays ?? [0]
  );
  if (employee.uses_default_weekly_off !== false) {
    return defaults;
  }
  return normalizeWeeklyOffDays(employee.weekly_off_days ?? []);
}

export function employeeUsesDefaultWeeklyOff(employee: WeeklyOffEmployeeLike): boolean {
  return employee.uses_default_weekly_off !== false;
}

