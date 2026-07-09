import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildEffectiveRulesFromOverrideRow,
  getAutoAbsenceCutoffBounds,
  isOverrideActiveForDate,
  parseClosingTime,
  pickOverrideForEmployee,
  timeOfDayToMinutes,
} from "./attendanceRules.service";
import type { AttendanceDailyOverrideRow, OverrideEmployeeSummary } from "./attendanceOverrides.types";

function makeRow(overrides: Partial<AttendanceDailyOverrideRow> = {}): AttendanceDailyOverrideRow {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    start_date: "2026-07-08",
    end_date: "2026-07-10",
    reason: "Heavy Rain",
    office_start_time: null,
    late_check_in_time: "11:00",
    half_day_cutoff: null,
    office_closing_time: null,
    min_hours_present: 4,
    min_hours_half_day: 2,
    is_enabled: true,
    apply_to_all: false,
    created_by: null,
    created_at: "2026-07-08T00:00:00.000Z",
    updated_at: "2026-07-08T00:00:00.000Z",
    ...overrides,
  };
}

describe("isOverrideActiveForDate", () => {
  it("returns false for disabled overrides", () => {
    assert.equal(isOverrideActiveForDate(makeRow({ is_enabled: false }), "2026-07-09"), false);
  });

  it("returns false outside the date range", () => {
    assert.equal(isOverrideActiveForDate(makeRow(), "2026-07-07"), false);
    assert.equal(isOverrideActiveForDate(makeRow(), "2026-07-11"), false);
  });

  it("returns true on boundary and within range dates", () => {
    assert.equal(isOverrideActiveForDate(makeRow(), "2026-07-08"), true);
    assert.equal(isOverrideActiveForDate(makeRow(), "2026-07-09"), true);
    assert.equal(isOverrideActiveForDate(makeRow(), "2026-07-10"), true);
  });
});

describe("buildEffectiveRulesFromOverrideRow", () => {
  it("returns defaults when no override row is provided", () => {
    const result = buildEffectiveRulesFromOverrideRow(null, "2026-07-09");
    assert.equal(result.activeOverride, null);
    assert.ok(result.settings.minHoursPresent > 0);
  });

  it("returns defaults when override is disabled or expired", () => {
    const disabled = buildEffectiveRulesFromOverrideRow(
      makeRow({ is_enabled: false }),
      "2026-07-09"
    );
    assert.equal(disabled.activeOverride, null);

    const expired = buildEffectiveRulesFromOverrideRow(makeRow(), "2026-07-15");
    assert.equal(expired.activeOverride, null);
  });

  it("merges only overridden fields from an active row", () => {
    const result = buildEffectiveRulesFromOverrideRow(makeRow(), "2026-07-09");
    assert.equal(result.activeOverride?.reason, "Heavy Rain");
    assert.equal(result.settings.lateCheckInTime, "11:00");
    assert.equal(result.settings.checkinOntimeEnd, "11:00");
    assert.equal(result.settings.minHoursPresent, 4);
    assert.equal(result.settings.minHoursHalfDay, 2);
  });
});

describe("auto-absence closing time helpers", () => {
  it("parses HH:mm closing times", () => {
    assert.deepEqual(parseClosingTime("17:30"), { hour: 17, minute: 30 });
  });

  it("picks employee-specific override closing time", () => {
    const employeeA = "00000000-0000-4000-8000-0000000000a1";
    const employeeB = "00000000-0000-4000-8000-0000000000b2";
    const overrideRow = makeRow({
      id: "00000000-0000-4000-8000-000000000002",
      office_closing_time: "14:00",
      apply_to_all: false,
    });
    const employeesByOverride = new Map<string, OverrideEmployeeSummary[]>([
      [overrideRow.id, [{ id: employeeA, employeeCode: "E1", name: "Alice" }]],
    ]);

    const picked = pickOverrideForEmployee(employeeA, "2026-07-09", [overrideRow], employeesByOverride);
    assert.equal(picked?.office_closing_time, "14:00");
    assert.equal(
      pickOverrideForEmployee(employeeB, "2026-07-09", [overrideRow], employeesByOverride),
      null
    );
  });

  it("computes earliest and latest cutoffs across employees", () => {
    const map = new Map([
      ["a", parseClosingTime("17:00")],
      ["b", parseClosingTime("14:00")],
      ["c", parseClosingTime("18:30")],
    ]);
    const bounds = getAutoAbsenceCutoffBounds(map);
    assert.deepEqual(bounds.earliest, { hour: 14, minute: 0 });
    assert.deepEqual(bounds.latest, { hour: 18, minute: 30 });
    assert.ok(timeOfDayToMinutes(bounds.earliest) < timeOfDayToMinutes(bounds.latest));
  });
});
