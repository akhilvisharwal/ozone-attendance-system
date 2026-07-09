import type { DayStatus } from "../../types";
import { classifyDayStatusAt } from "../../utils/attendanceTiming";
import type { EffectiveAttendanceSettings } from "./attendanceRules.service";

/** Resolves day_status from check-in flags and worked minutes (shared by checkout + EOD finalization). */
export function resolveAutomaticDayStatus(input: {
  isHalfDay: boolean;
  checkInStatus: string | null | undefined;
  totalMinutes: number | null | undefined;
  autoCalculate: boolean;
  settings: EffectiveAttendanceSettings;
}): DayStatus {
  if (!input.autoCalculate) {
    return input.isHalfDay || input.checkInStatus === "half_day" ? "half_day" : "present";
  }
  return classifyDayStatusAt(input.totalMinutes, input.settings);
}
