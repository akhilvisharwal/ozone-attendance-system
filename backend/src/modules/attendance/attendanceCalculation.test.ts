import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { MonthlyDayCell, MonthlySummary } from "./attendance.monthly";
import {
  buildSummaryFromDays,
  computeAttendancePercentage,
  computeWorkingDays,
  isIncompleteAttendanceDay,
  resolveDayStatus,
} from "./attendanceCalculation.service";

function day(
  date: string,
  status: MonthlyDayCell["status"],
  totalMinutes: number | null = null,
  late = false
): MonthlyDayCell {
  return {
    day: Number(date.slice(-2)),
    date,
    status,
    totalMinutes,
    late,
    holidayName: null,
  };
}

describe("attendance calculation service", () => {
  it("computes working days as elapsed calendar days minus weekly offs, holidays, and pending", () => {
    const days = [
      day("2026-07-01", "absent"),
      day("2026-07-02", "absent"),
      day("2026-07-03", "absent"),
      day("2026-07-04", "absent"),
      day("2026-07-05", "weekly_off"),
      day("2026-07-06", "absent"),
      day("2026-07-07", "absent"),
      day("2026-07-08", "none"),
      day("2026-07-09", "none"),
    ];
    assert.equal(computeWorkingDays(days, "2026-07-08"), 6);
  });

  it("builds summary counts that exactly match calendar cells", () => {
    const days = [
      day("2026-07-01", "present", 480),
      day("2026-07-02", "half_day", 240),
      day("2026-07-03", "absent"),
      day("2026-07-04", "leave"),
      day("2026-07-05", "weekly_off"),
      day("2026-07-06", "holiday"),
      day("2026-07-07", "holiday_worked", 360),
      day("2026-07-08", "weekly_off_worked", 300, true),
      day("2026-07-09", "none"),
    ];

    const summary = buildSummaryFromDays(days, "2026-07-08");
    assert.equal(summary.present, 1);
    assert.equal(summary.halfDay, 1);
    assert.equal(summary.absent, 1);
    assert.equal(summary.leave, 1);
    assert.equal(summary.weeklyOff, 1);
    assert.equal(summary.holidays, 1);
    assert.equal(summary.holidayWorked, 1);
    assert.equal(summary.weeklyOffWorked, 1);
    assert.equal(summary.totalMinutes, 480 + 240 + 360 + 300);
    assert.equal(summary.lateCheckIns, 1);
    assert.equal(summary.workingDays, 6);
    assert.equal(summary.attendancePercentage, 75);
  });

  it("includes leave in attendance percentage numerator", () => {
    const summary: MonthlySummary = {
      present: 4,
      halfDay: 1,
      absent: 0,
      leave: 1,
      weeklyOff: 1,
      holidays: 0,
      holidayWorked: 0,
      weeklyOffWorked: 0,
      totalMinutes: 0,
      workingDays: 6,
      attendancePercentage: 0,
      lateCheckIns: 0,
    };
    assert.equal(computeAttendancePercentage(summary), 91.7);
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

  it("treats today auto-absent record as pending before closing cutoff", () => {
    const status = resolveDayStatus({
      record: {
        status: "absent",
        day_status: "absent",
        check_in_time: null,
        is_admin_marked: false,
      },
      hasLeave: false,
      isHoliday: false,
      isWeeklyOff: false,
      isFuture: false,
      isToday: true,
      isPastClosingCutoff: false,
    });
    assert.equal(status, "none");
    assert.equal(isIncompleteAttendanceDay({ check_in_time: null }), true);
  });

  it("respects manual weekly off status on a working weekday", () => {
    const status = resolveDayStatus({
      record: {
        is_admin_marked: true,
        admin_mark_status: "weekly_off",
        check_in_time: null,
      },
      hasLeave: false,
      isHoliday: false,
      isWeeklyOff: false,
      isFuture: false,
      isToday: false,
      isPastClosingCutoff: true,
    });
    assert.equal(status, "weekly_off");
  });

  it("does not include absent day minutes in total hours", () => {
    const days = [
      day("2026-07-01", "absent", 480),
      day("2026-07-02", "present", 480),
    ];
    const summary = buildSummaryFromDays(days, "2026-07-02");
    assert.equal(summary.totalMinutes, 480);
  });
});
