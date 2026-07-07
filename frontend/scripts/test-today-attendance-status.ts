import assert from "node:assert/strict";
import type { AttendanceRecord } from "../src/types";
import { resolveTodayAttendanceStatus } from "../src/utils/todayAttendanceStatus";

const RULES = {
  checkinOpenTime: "09:00",
  checkinOntimeEnd: "10:07",
  halfDayCutoff: "12:00",
  checkoutStandardTime: "18:00",
};

const THRESHOLDS = { minHoursPresent: 8, minHoursHalfDay: 4 };

function record(partial: Partial<AttendanceRecord> & Pick<AttendanceRecord, "status">): AttendanceRecord {
  return {
    id: "1",
    employee_id: "e1",
    attendance_date: "2026-07-07",
    check_in_time: null,
    check_in_latitude: null,
    check_in_longitude: null,
    check_in_address: null,
    check_in_selfie_path: null,
    check_in_device_info: null,
    check_out_time: null,
    check_out_latitude: null,
    check_out_longitude: null,
    check_out_address: null,
    site_id: null,
    work_summary: null,
    work_status: null,
    remarks: null,
    site_photo_paths: [],
    total_minutes: null,
    day_status: null,
    check_in_status: null,
    is_half_day: false,
    check_out_status: null,
    is_admin_marked: false,
    admin_marked_by: null,
    admin_mark_reason: null,
    created_at: "",
    updated_at: "",
    ...partial,
  };
}

function minutesAgo(now: Date, minutes: number): string {
  return new Date(now.getTime() - minutes * 60_000).toISOString();
}

const now = new Date("2026-07-07T10:00:00");

assert.equal(resolveTodayAttendanceStatus(null, RULES, THRESHOLDS, now), null);

const afterCutoff = new Date("2026-07-07T13:00:00");
assert.equal(resolveTodayAttendanceStatus(null, RULES, THRESHOLDS, afterCutoff)?.status, "absent");

const checkedIn = record({
  status: "checked_in",
  check_in_time: minutesAgo(now, 2),
  check_in_status: "on_time",
});
assert.equal(resolveTodayAttendanceStatus(checkedIn, RULES, THRESHOLDS, now)?.status, "working");
assert.equal(resolveTodayAttendanceStatus(checkedIn, RULES, THRESHOLDS, now)?.label, "Working");

const checkedInLate = record({
  status: "checked_in",
  check_in_time: minutesAgo(now, 60),
  check_in_status: "half_day",
  is_half_day: true,
});
assert.equal(resolveTodayAttendanceStatus(checkedInLate, RULES, THRESHOLDS, now)?.status, "working");

const checkedOutPresent = record({
  status: "checked_out",
  day_status: "present",
  check_in_time: minutesAgo(now, 9 * 60),
  check_out_time: now.toISOString(),
  total_minutes: 540,
});
assert.equal(resolveTodayAttendanceStatus(checkedOutPresent, RULES, THRESHOLDS, now)?.status, "present");
assert.equal(resolveTodayAttendanceStatus(checkedOutPresent, RULES, THRESHOLDS, now)?.label, "Present");

const checkedOutHalf = record({
  status: "checked_out",
  day_status: "half_day",
  total_minutes: 300,
});
assert.equal(resolveTodayAttendanceStatus(checkedOutHalf, RULES, THRESHOLDS, now)?.status, "half_day");

const checkedOutAbsent = record({
  status: "checked_out",
  day_status: "absent",
  check_in_time: minutesAgo(now, 30),
  check_out_time: now.toISOString(),
  total_minutes: 18,
});
assert.equal(resolveTodayAttendanceStatus(checkedOutAbsent, RULES, THRESHOLDS, now)?.status, "absent");

const checkedOutComputedAbsent = record({
  status: "checked_out",
  day_status: null,
  total_minutes: 18,
});
assert.equal(
  resolveTodayAttendanceStatus(checkedOutComputedAbsent, RULES, THRESHOLDS, now)?.status,
  "absent"
);

const checkedOutComputedHalf = record({
  status: "checked_out",
  day_status: null,
  total_minutes: 300,
});
assert.equal(
  resolveTodayAttendanceStatus(checkedOutComputedHalf, RULES, THRESHOLDS, now)?.status,
  "half_day"
);

const adminAbsent = record({ status: "absent", day_status: "absent" });
assert.equal(resolveTodayAttendanceStatus(adminAbsent, RULES, THRESHOLDS, now)?.status, "absent");

console.log("All todayAttendanceStatus tests passed.");
