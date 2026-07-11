import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { MonthlyDayCell, MonthlySummary } from "./attendance.monthly";
import {
  buildSummaryFromDays,
  computeAttendancePercentage,
  computeWorkingDays,
  isIncompleteAttendanceDay,
  resolveDayStatus,
  applyAbsentSandwichRule,
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

  it("treats today auto-absent record as absent even before closing cutoff display window", () => {
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
    assert.equal(status, "absent");
    assert.equal(isIncompleteAttendanceDay({ status: "absent", day_status: "absent" }), false);
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

  it("excludes pre-join days from working days, absent counts, and attendance percentage", () => {
    const days = [
      day("2026-07-01", "not_applicable"),
      day("2026-07-02", "not_applicable"),
      day("2026-07-03", "not_applicable"),
      day("2026-07-04", "not_applicable"),
      day("2026-07-05", "not_applicable"),
      day("2026-07-06", "not_applicable"),
      day("2026-07-07", "not_applicable"),
      day("2026-07-08", "not_applicable"),
      day("2026-07-09", "not_applicable"),
      day("2026-07-10", "not_applicable"),
      day("2026-07-11", "not_applicable"),
      day("2026-07-12", "not_applicable"),
      day("2026-07-13", "not_applicable"),
      day("2026-07-14", "not_applicable"),
      day("2026-07-15", "present", 480),
      day("2026-07-16", "absent"),
      day("2026-07-17", "present", 450),
    ];

    const summary = buildSummaryFromDays(days, "2026-07-17");
    assert.equal(summary.present, 2);
    assert.equal(summary.absent, 1);
    assert.equal(summary.weeklyOff, 0);
    assert.equal(summary.workingDays, 3);
    assert.equal(summary.attendancePercentage, 66.7);
    assert.equal(computeWorkingDays(days, "2026-07-17"), 3);
  });

  it("treats all pre-join elapsed days as not applicable with zero working days", () => {
    const days = [
      day("2026-07-01", "not_applicable"),
      day("2026-07-02", "not_applicable"),
      day("2026-07-03", "not_applicable"),
    ];
    const summary = buildSummaryFromDays(days, "2026-07-03");
    assert.equal(summary.absent, 0);
    assert.equal(summary.workingDays, 0);
    assert.equal(summary.attendancePercentage, 0);
  });

  it("maps checked-in half-day records to half_day before checkout finalization", () => {
    const status = resolveDayStatus({
      record: {
        status: "checked_in",
        check_in_status: "half_day",
        is_half_day: true,
        check_in_time: "2026-07-09T12:00:00Z",
      },
      hasLeave: false,
      isHoliday: false,
      isWeeklyOff: false,
      isFuture: false,
      isToday: false,
      isPastClosingCutoff: true,
    });
    assert.equal(status, "half_day");
  });

  it("does not treat auto-absent rows as pending on the current day", () => {
    const status = resolveDayStatus({
      record: {
        status: "absent",
        day_status: "absent",
        check_in_time: null,
      },
      hasLeave: false,
      isHoliday: false,
      isWeeklyOff: false,
      isFuture: false,
      isToday: true,
      isPastClosingCutoff: false,
    });
    assert.equal(status, "absent");
  });

  it("applies absent sandwich rule to a single weekly off between absents", () => {
    const days = [
      day("2026-07-11", "absent"), // Saturday
      day("2026-07-12", "weekly_off"), // Sunday
      day("2026-07-13", "absent"), // Monday
    ];
    const result = applyAbsentSandwichRule(days);
    assert.equal(result[0].status, "absent");
    assert.equal(result[1].status, "absent");
    assert.equal(result[2].status, "absent");
  });

  it("applies sandwich rule across consecutive weekly offs and holidays", () => {
    const days = [
      day("2026-07-10", "absent"),
      day("2026-07-11", "weekly_off"),
      day("2026-07-12", "holiday"),
      day("2026-07-13", "weekly_off"),
      day("2026-07-14", "absent"),
      day("2026-07-15", "present", 480),
    ];
    const result = applyAbsentSandwichRule(days);
    assert.deepEqual(
      result.map((d) => d.status),
      ["absent", "absent", "absent", "absent", "absent", "present"]
    );
    const summary = buildSummaryFromDays(result, "2026-07-15");
    assert.equal(summary.absent, 5);
    assert.equal(summary.weeklyOff, 0);
    assert.equal(summary.holidays, 0);
    assert.equal(summary.workingDays, 6);
  });

  it("does not sandwich when one side is present or leave", () => {
    const presentSide = applyAbsentSandwichRule([
      day("2026-07-11", "present", 480),
      day("2026-07-12", "weekly_off"),
      day("2026-07-13", "absent"),
    ]);
    assert.equal(presentSide[1].status, "weekly_off");

    const leaveSide = applyAbsentSandwichRule([
      day("2026-07-11", "absent"),
      day("2026-07-12", "holiday"),
      day("2026-07-13", "leave"),
    ]);
    assert.equal(leaveSide[1].status, "holiday");
  });

  it("does not sandwich pending or incomplete edge days", () => {
    const result = applyAbsentSandwichRule([
      day("2026-07-11", "absent"),
      day("2026-07-12", "weekly_off"),
      day("2026-07-13", "none"),
    ]);
    assert.equal(result[1].status, "weekly_off");
  });

  it("leaves weekly offs untouched without absent neighbors", () => {
    const result = applyAbsentSandwichRule([
      day("2026-07-11", "present", 480),
      day("2026-07-12", "weekly_off"),
      day("2026-07-13", "present", 480),
    ]);
    assert.equal(result[1].status, "weekly_off");
  });
});
