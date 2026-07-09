import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeAttendanceSettings } from "./settingsHelpers";
import { classifyCheckInAt, classifyDayStatusAt } from "./attendanceTiming";
import type { AttendanceSettings } from "../modules/settings/settings.types";

const baseSettings = normalizeAttendanceSettings({
  officeStartTime: "09:30",
  lateCheckInTime: "10:07",
  officeClosingTime: "18:30",
  halfDayCutoff: "11:30",
  minHoursPresent: 8,
  minHoursHalfDay: 3,
  autoCalculate: true,
  allowManualOverride: true,
  allowMultipleCheckIns: false,
  checkinOpenTime: "09:30",
  checkinOntimeEnd: "10:07",
} as AttendanceSettings);

function atTime(hours: number, minutes: number): Date {
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

describe("attendance timing settings", () => {
  it("classifies on-time check-in within office window", () => {
    const result = classifyCheckInAt(atTime(9, 45), baseSettings);
    assert.equal(result.status, "on_time");
    assert.equal(result.isHalfDay, false);
  });

  it("classifies late check-in after on-time end", () => {
    const result = classifyCheckInAt(atTime(10, 30), baseSettings);
    assert.equal(result.status, "late");
    assert.equal(result.isHalfDay, false);
  });

  it("classifies half-day check-in after cutoff", () => {
    const result = classifyCheckInAt(atTime(12, 0), baseSettings);
    assert.equal(result.status, "half_day");
    assert.equal(result.isHalfDay, true);
  });

  it("classifies present when hours meet full-day threshold", () => {
    assert.equal(classifyDayStatusAt(480, baseSettings), "present");
  });

  it("classifies half-day when hours meet half-day threshold only", () => {
    assert.equal(classifyDayStatusAt(240, baseSettings), "half_day");
  });

  it("classifies absent when hours are below half-day threshold", () => {
    assert.equal(classifyDayStatusAt(120, baseSettings), "absent");
  });

  it("syncs legacy timing fields from admin-facing settings", () => {
    const normalized = normalizeAttendanceSettings({
      ...baseSettings,
      officeStartTime: "08:00",
      lateCheckInTime: "08:30",
    });
    assert.equal(normalized.checkinOpenTime, "08:00");
    assert.equal(normalized.checkinOntimeEnd, "08:30");
  });
});
