import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../../config/db";
import { initSettingsCache } from "../settings/settings.cache";
import {
  createOverride,
  deleteOverride,
  findOverrideForEmployeeAndDate,
  setOverrideEnabled,
} from "./attendanceOverrides.repository";
import { getEffectiveAttendanceRules } from "./attendanceRules.service";
import { todayDateString, toDateString } from "../../utils/date";

describe("attendance override integration", { skip: process.env.SKIP_DB_TESTS === "1" }, () => {
  let employeeA: string;
  let employeeB: string;
  let overrideId: string | null = null;
  const today = todayDateString();

  before(async () => {
    await initSettingsCache();
    const employees = await pool.query<{ id: string }>(
      `SELECT id FROM employees
        WHERE role = 'employee' AND is_active = true AND deleted_at IS NULL
        ORDER BY created_at ASC
        LIMIT 2`
    );
    if (employees.rows.length < 2) {
      throw new Error("Need at least two active employees for override integration tests");
    }
    [employeeA, employeeB] = employees.rows.map((row) => row.id);
  });

  after(async () => {
    if (overrideId) {
      await deleteOverride(overrideId);
    }
  });

  it("applies override only to assigned employees on selected dates", async () => {
    const row = await createOverride({
      startDate: today,
      endDate: today,
      reason: "Integration Test Override",
      lateCheckInTime: "12:30",
      minHoursPresent: 4,
      minHoursHalfDay: 2,
      applyToAll: false,
      employeeIds: [employeeA],
    });
    overrideId = row.id;

    const forAssigned = await findOverrideForEmployeeAndDate(employeeA, today);
    const forOther = await findOverrideForEmployeeAndDate(employeeB, today);
    assert.ok(forAssigned);
    assert.equal(forOther, null);

    const assignedRules = await getEffectiveAttendanceRules(today, employeeA);
    const defaultRules = await getEffectiveAttendanceRules(today, employeeB);
    assert.equal(assignedRules.activeOverride?.reason, "Integration Test Override");
    assert.equal(assignedRules.settings.lateCheckInTime, "12:30");
    assert.equal(defaultRules.activeOverride, null);
    assert.notEqual(defaultRules.settings.lateCheckInTime, "12:30");
  });

  it("reverts to defaults when disabled, outside range, or deleted", async () => {
    assert.ok(overrideId);

    await setOverrideEnabled(overrideId, false);
    let rules = await getEffectiveAttendanceRules(today, employeeA);
    assert.equal(rules.activeOverride, null);

    await setOverrideEnabled(overrideId, true);
    rules = await getEffectiveAttendanceRules(today, employeeA);
    assert.ok(rules.activeOverride);

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = toDateString(yesterday);
    rules = await getEffectiveAttendanceRules(yesterdayStr, employeeA);
    assert.equal(rules.activeOverride, null);

    await deleteOverride(overrideId);
    overrideId = null;
    rules = await getEffectiveAttendanceRules(today, employeeA);
    assert.equal(rules.activeOverride, null);
  });

  it("apply-to-all overrides cover every active employee", async () => {
    const row = await createOverride({
      startDate: today,
      endDate: today,
      reason: "Integration All Employees",
      minHoursPresent: 5,
      applyToAll: true,
      employeeIds: [],
    });
    overrideId = row.id;

    const forA = await findOverrideForEmployeeAndDate(employeeA, today);
    const forB = await findOverrideForEmployeeAndDate(employeeB, today);
    assert.ok(forA);
    assert.ok(forB);

    const rulesB = await getEffectiveAttendanceRules(today, employeeB);
    assert.equal(rulesB.settings.minHoursPresent, 5);
  });
});
