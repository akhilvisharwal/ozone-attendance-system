import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isEligibleForAttendanceReminder } from "./attendance.reminders";
import { resolveDayStatus } from "./attendanceCalculation.service";

describe("attendance reminder eligibility", () => {
  it("includes employees with pending check-in on a working day", () => {
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
    assert.equal(isEligibleForAttendanceReminder(status), true);
  });

  it("excludes employees on leave", () => {
    const status = resolveDayStatus({
      record: null,
      hasLeave: true,
      isHoliday: false,
      isWeeklyOff: false,
      isFuture: false,
      isToday: true,
      isPastClosingCutoff: false,
    });
    assert.equal(status, "leave");
    assert.equal(isEligibleForAttendanceReminder(status), false);
  });

  it("excludes employees on holiday", () => {
    const status = resolveDayStatus({
      record: null,
      hasLeave: false,
      isHoliday: true,
      isWeeklyOff: false,
      isFuture: false,
      isToday: true,
      isPastClosingCutoff: false,
    });
    assert.equal(status, "holiday");
    assert.equal(isEligibleForAttendanceReminder(status), false);
  });

  it("excludes employees on weekly off", () => {
    const status = resolveDayStatus({
      record: null,
      hasLeave: false,
      isHoliday: false,
      isWeeklyOff: true,
      isFuture: false,
      isToday: true,
      isPastClosingCutoff: false,
    });
    assert.equal(status, "weekly_off");
    assert.equal(isEligibleForAttendanceReminder(status), false);
  });

  it("excludes employees who already checked in", () => {
    const status = resolveDayStatus({
      record: {
        status: "checked_in",
        check_in_time: "2026-07-10T09:00:00Z",
        day_status: null,
        check_in_status: "on_time",
        is_half_day: false,
        is_admin_marked: false,
      },
      hasLeave: false,
      isHoliday: false,
      isWeeklyOff: false,
      isFuture: false,
      isToday: true,
      isPastClosingCutoff: false,
    });
    assert.equal(status, "present");
    assert.equal(isEligibleForAttendanceReminder(status), false);
  });
});
