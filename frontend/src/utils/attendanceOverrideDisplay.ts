import type { AttendanceDailyOverride } from "@/types/settings";
import { formatTimeOfDay } from "@/utils/format";

export function summarizeOverrideRules(override: AttendanceDailyOverride): string {
  const parts: string[] = [];
  if (override.minHoursPresent != null) parts.push(`Present ≥ ${override.minHoursPresent}h`);
  if (override.minHoursHalfDay != null) parts.push(`Half day ≥ ${override.minHoursHalfDay}h`);
  if (override.lateCheckInTime != null) parts.push(`Late after ${formatTimeOfDay(override.lateCheckInTime)}`);
  if (override.halfDayCutoff != null) parts.push(`Half-day cutoff ${formatTimeOfDay(override.halfDayCutoff)}`);
  if (override.officeClosingTime != null) parts.push(`Closing ${formatTimeOfDay(override.officeClosingTime)}`);
  if (override.officeStartTime != null) parts.push(`Start ${formatTimeOfDay(override.officeStartTime)}`);
  return parts.join(" · ") || "Custom rules";
}

export function assignmentLabel(override: AttendanceDailyOverride): string {
  if (override.applyToAll) return "All Employees";
  if (override.employees.length === 0) return "No employees assigned";
  if (override.employees.length <= 2) {
    return override.employees.map((e) => e.name).join(", ");
  }
  return `${override.employees.length} employees`;
}
