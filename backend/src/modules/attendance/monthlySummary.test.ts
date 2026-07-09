import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { MonthlyDayCell } from "./attendance.monthly";
import {
  buildSummaryFromDays,
  computeWorkingDays,
  resolveDayStatus,
} from "./attendanceCalculation.service";

function day(date: string, status: MonthlyDayCell["status"]): MonthlyDayCell {
  return {
    day: Number(date.slice(-2)),
    date,
    status,
    totalMinutes: null,
    late: false,
    holidayName: null,
  };
}

describe("monthly summary calculations", () => {
  it("computes working days using calendar formula", () => {
    const days = [
      day("2026-07-01", "present"),
      day("2026-07-02", "half_day"),
      day("2026-07-03", "absent"),
      day("2026-07-04", "leave"),
      day("2026-07-05", "weekly_off"),
      day("2026-07-06", "holiday"),
      day("2026-07-07", "holiday_worked"),
      day("2026-07-08", "weekly_off_worked"),
      day("2026-07-09", "none"),
    ];
    assert.equal(computeWorkingDays(days, "2026-07-08"), 6);
  });

  it("finalizes working days from day cells instead of miscounting today as absent", () => {
    const days = [
      day("2026-07-01", "present"),
      day("2026-07-02", "present"),
      day("2026-07-03", "present"),
      day("2026-07-04", "present"),
      day("2026-07-05", "weekly_off"),
      day("2026-07-06", "present"),
      day("2026-07-07", "present"),
      day("2026-07-08", "none"),
    ];

    const finalized = buildSummaryFromDays(days, "2026-07-08");
    assert.equal(finalized.workingDays, 6);
    assert.equal(finalized.present, 6);
    assert.equal(finalized.attendancePercentage, 100);
  });

  it("treats today without a record as pending, not absent", () => {
    const status = resolveDayStatus({
      record: null,
      hasLeave: false,
      isHoliday: false,
      isWeeklyOff: false,
      isFuture: false,
      isToday: true,
      isPastClosingCutoff: false,
    });
    assert.equal(status, "none");
  });

  it("marks past working days without records as absent", () => {
    const status = resolveDayStatus({
      record: null,
      hasLeave: false,
      isHoliday: false,
      isWeeklyOff: false,
      isFuture: false,
      isToday: false,
      isPastClosingCutoff: true,
    });
    assert.equal(status, "absent");
  });
});
