import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { MonthlyDayCell, MonthlySummary } from "./attendance.monthly";
import {
  buildSummaryFromDays,
  computeAttendancePercentage,
  computePresentEquivalent,
  computeWorkedOnOffDays,
  computeWorkingDays,
  formatPresentEquivalent,
  isIncompleteAttendanceDay,
  resolveDayStatus,
  cellStatusFromRecord,
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
  it("computes working days as present + half-day + absent + leave (excludes offs, holidays, pending)", () => {
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
    assert.equal(summary.absent, 2);
    assert.equal(summary.leave, 1);
    assert.equal(summary.weeklyOff, 1);
    assert.equal(summary.holidays, 1);
    assert.equal(summary.holidayWorked, 1);
    assert.equal(summary.weeklyOffWorked, 1);
    assert.equal(summary.totalMinutes, 480 + 240 + 360 + 300);
    assert.equal(summary.lateCheckIns, 1);
    assert.equal(summary.workingDays, 4);
    assert.equal(summary.presentEquivalent, 1.5);
    assert.equal(computeWorkedOnOffDays(summary), 2);
    assert.equal(summary.attendancePercentage, 37.5);
  });

  it("counts approved leave as absent in the monthly total and attendance percentage", () => {
    const summary: MonthlySummary = {
      present: 4,
      halfDay: 1,
      absent: 1,
      leave: 1,
      weeklyOff: 1,
      holidays: 0,
      holidayWorked: 0,
      weeklyOffWorked: 0,
      presentEquivalent: 4.5,
      totalMinutes: 0,
      workingDays: 6,
      attendancePercentage: 0,
      lateCheckIns: 0,
    };
    assert.equal(computeAttendancePercentage(summary), 75);

    const days = [
      day("2026-07-01", "present"),
      day("2026-07-02", "present"),
      day("2026-07-03", "present"),
      day("2026-07-04", "present"),
      day("2026-07-05", "half_day"),
      day("2026-07-06", "leave"),
      day("2026-07-07", "weekly_off"),
    ];
    const built = buildSummaryFromDays(days, "2026-07-07");
    assert.equal(built.leave, 1);
    assert.equal(built.absent, 1);
    assert.equal(built.workingDays, 6);
    assert.equal(built.presentEquivalent, 4.5);
    assert.equal(built.attendancePercentage, 75);
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

  it("counts a normal working-day present as 1 present equivalent", () => {
    const status = resolveDayStatus({
      record: { day_status: "present", check_in_time: "2026-08-03T04:00:00Z" },
      hasLeave: false,
      isHoliday: false,
      isWeeklyOff: false,
      isFuture: false,
      isToday: false,
      isPastClosingCutoff: true,
    });
    assert.equal(status, "present");
    const summary = buildSummaryFromDays([day("2026-08-03", "present", 480)], "2026-08-03");
    assert.equal(summary.present, 1);
    assert.equal(summary.presentEquivalent, 1);
    assert.equal(summary.absent, 0);
    assert.equal(summary.workingDays, 1);
    assert.equal(summary.attendancePercentage, 100);
  });

  it("counts a normal working-day absence only on eligible scheduled days", () => {
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
    const summary = buildSummaryFromDays([day("2026-08-04", "absent")], "2026-08-04");
    assert.equal(summary.absent, 1);
    assert.equal(summary.presentEquivalent, 0);
    assert.equal(summary.workingDays, 1);
    assert.equal(summary.attendancePercentage, 0);
  });

  it("treats work on a holiday as HW without adding it to Present or Attendance %", () => {
    const status = resolveDayStatus({
      record: {
        day_status: "present",
        special_day_status: "holiday_worked",
        check_in_time: "2026-08-15T04:00:00Z",
      },
      hasLeave: false,
      isHoliday: true,
      isWeeklyOff: false,
      isFuture: false,
      isToday: false,
      isPastClosingCutoff: true,
    });
    assert.equal(status, "holiday_worked");
    assert.equal(
      cellStatusFromRecord({ day_status: "present", check_in_time: "2026-08-15T04:00:00Z" }, false, true),
      "holiday_worked"
    );

    const summary = buildSummaryFromDays(
      [day("2026-08-14", "present", 480), day("2026-08-15", "holiday_worked", 480)],
      "2026-08-15"
    );
    assert.equal(summary.present, 1);
    assert.equal(summary.holidayWorked, 1);
    assert.equal(summary.presentEquivalent, 1);
    assert.equal(computeWorkedOnOffDays(summary), 1);
    assert.equal(summary.absent, 0);
    assert.equal(summary.workingDays, 1);
    assert.equal(summary.attendancePercentage, 100);
    assert.equal(formatPresentEquivalent(summary.presentEquivalent), "1");
  });

  it("treats work on a weekly off as WW without adding it to Present or Attendance %", () => {
    const status = resolveDayStatus({
      record: {
        day_status: "present",
        special_day_status: "weekly_off_worked",
        check_in_time: "2026-08-09T04:00:00Z",
      },
      hasLeave: false,
      isHoliday: false,
      isWeeklyOff: true,
      isFuture: false,
      isToday: false,
      isPastClosingCutoff: true,
    });
    assert.equal(status, "weekly_off_worked");
    assert.equal(
      cellStatusFromRecord({ day_status: "present", check_in_time: "2026-08-09T04:00:00Z" }, true, false),
      "weekly_off_worked"
    );

    const summary = buildSummaryFromDays(
      [day("2026-08-08", "present", 480), day("2026-08-09", "weekly_off_worked", 480)],
      "2026-08-09"
    );
    assert.equal(summary.weeklyOffWorked, 1);
    assert.equal(summary.presentEquivalent, 1);
    assert.equal(computeWorkedOnOffDays(summary), 1);
    assert.equal(summary.absent, 0);
    assert.equal(summary.workingDays, 1);
    assert.equal(summary.attendancePercentage, 100);
  });

  it("does not count a holiday or weekly off without work as absent", () => {
    assert.equal(
      resolveDayStatus({
        record: null,
        hasLeave: false,
        isHoliday: true,
        isWeeklyOff: false,
        isFuture: false,
        isToday: false,
        isPastClosingCutoff: true,
      }),
      "holiday"
    );
    assert.equal(
      resolveDayStatus({
        record: null,
        hasLeave: false,
        isHoliday: false,
        isWeeklyOff: true,
        isFuture: false,
        isToday: false,
        isPastClosingCutoff: true,
      }),
      "weekly_off"
    );
    // Auto-absent rows on offs must not become A or HW/WW.
    assert.equal(
      cellStatusFromRecord({ status: "absent", day_status: "absent", check_in_time: null }, false, true),
      "holiday"
    );
    assert.equal(
      cellStatusFromRecord({ status: "absent", day_status: "absent", check_in_time: null }, true, false),
      "weekly_off"
    );

    const summary = buildSummaryFromDays(
      [day("2026-08-15", "holiday"), day("2026-08-16", "weekly_off"), day("2026-08-17", "present")],
      "2026-08-17"
    );
    assert.equal(summary.absent, 0);
    assert.equal(summary.holidays, 1);
    assert.equal(summary.weeklyOff, 1);
    assert.equal(summary.workingDays, 1);
    assert.equal(summary.presentEquivalent, 1);
    assert.equal(computeWorkedOnOffDays(summary), 0);
    assert.equal(summary.attendancePercentage, 100);
  });

  it("credits a half day as 0.5 present equivalent", () => {
    const status = resolveDayStatus({
      record: {
        day_status: "half_day",
        is_half_day: true,
        check_in_time: "2026-08-05T06:00:00Z",
      },
      hasLeave: false,
      isHoliday: false,
      isWeeklyOff: false,
      isFuture: false,
      isToday: false,
      isPastClosingCutoff: true,
    });
    assert.equal(status, "half_day");
    const summary = buildSummaryFromDays(
      [day("2026-08-05", "half_day", 240), day("2026-08-06", "present", 480)],
      "2026-08-06"
    );
    assert.equal(summary.halfDay, 1);
    assert.equal(summary.presentEquivalent, 1.5);
    assert.equal(formatPresentEquivalent(summary.presentEquivalent), "1.5");
    assert.equal(summary.workingDays, 2);
    assert.equal(summary.attendancePercentage, 75);
  });

  it("displays approved leave as L and counts it as 1 absent day", () => {
    const status = resolveDayStatus({
      record: null,
      hasLeave: true,
      isHoliday: false,
      isWeeklyOff: false,
      isFuture: false,
      isToday: false,
      isPastClosingCutoff: true,
    });
    assert.equal(status, "leave");
    assert.equal(
      resolveDayStatus({
        record: { status: "absent", day_status: "absent", check_in_time: null },
        hasLeave: true,
        isHoliday: false,
        isWeeklyOff: false,
        isFuture: false,
        isToday: false,
        isPastClosingCutoff: true,
      }),
      "leave"
    );
    const summary = buildSummaryFromDays(
      [day("2026-08-10", "leave"), day("2026-08-11", "present"), day("2026-08-12", "absent")],
      "2026-08-12"
    );
    assert.equal(summary.leave, 1);
    assert.equal(summary.absent, 2);
    assert.equal(summary.present, 1);
    assert.equal(summary.workingDays, 3);
    assert.equal(summary.presentEquivalent, 1);
    assert.equal(summary.attendancePercentage, 33.3);
  });

  it("does not count dates before joining as absent", () => {
    const summary = buildSummaryFromDays(
      [
        day("2026-08-01", "not_applicable"),
        day("2026-08-02", "not_applicable"),
        day("2026-08-03", "present", 480),
      ],
      "2026-08-03"
    );
    assert.equal(summary.absent, 0);
    assert.equal(summary.present, 1);
    assert.equal(summary.presentEquivalent, 1);
    assert.equal(summary.workingDays, 1);
    assert.equal(summary.attendancePercentage, 100);
    assert.equal(computePresentEquivalent(summary), 1);
  });

  it("counts HW and WW only in Worked on Off Days, not Present/Worked or Attendance %", () => {
    // Fragment of an August 2026 register: Independence Day (15th) worked, a Sunday worked,
    // an unworked Sunday, plus normal present/absent/half-day.
    const days = [
      day("2026-08-10", "present", 480),
      day("2026-08-11", "absent"),
      day("2026-08-12", "half_day", 240),
      day("2026-08-13", "present", 480),
      day("2026-08-14", "present", 480),
      day("2026-08-15", "holiday_worked", 480), // Independence Day worked
      day("2026-08-16", "weekly_off"),
      day("2026-08-17", "present", 480),
      day("2026-08-23", "weekly_off_worked", 480), // Sunday worked
    ];
    const summary = buildSummaryFromDays(days, "2026-08-31");
    assert.equal(summary.present, 4);
    assert.equal(summary.halfDay, 1);
    assert.equal(summary.holidayWorked, 1);
    assert.equal(summary.weeklyOffWorked, 1);
    assert.equal(summary.weeklyOff, 1);
    assert.equal(summary.absent, 1);
    assert.equal(summary.presentEquivalent, 4.5); // 4P + 0.5H, HW/WW excluded
    assert.equal(computeWorkedOnOffDays(summary), 2);
    assert.equal(summary.workingDays, 6); // P+H+A; HW/WW excluded
    assert.equal(summary.attendancePercentage, 75);
    assert.equal(formatPresentEquivalent(summary.presentEquivalent), "4.5");
  });

  it("does not count leave on a holiday or weekly off as absent", () => {
    assert.equal(
      resolveDayStatus({
        record: null,
        hasLeave: true,
        isHoliday: true,
        isWeeklyOff: false,
        isFuture: false,
        isToday: false,
        isPastClosingCutoff: true,
      }),
      "holiday"
    );
    assert.equal(
      resolveDayStatus({
        record: null,
        hasLeave: true,
        isHoliday: false,
        isWeeklyOff: true,
        isFuture: false,
        isToday: false,
        isPastClosingCutoff: true,
      }),
      "weekly_off"
    );
    const summary = buildSummaryFromDays(
      [day("2026-08-15", "holiday"), day("2026-08-16", "weekly_off")],
      "2026-08-16"
    );
    assert.equal(summary.absent, 0);
    assert.equal(summary.leave, 0);
    assert.equal(summary.workingDays, 0);
    assert.equal(summary.attendancePercentage, 0);
  });
});
