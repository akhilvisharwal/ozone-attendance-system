import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../../config/db";
import { initSettingsCache, updateCategory } from "../settings/settings.cache";
import { createEmployee } from "./employees.repository";
import { buildMonthlyGrid } from "../attendance/attendance.monthly";
import { normalizeWeeklyOffDays, resolveWeeklyOffDays } from "../../utils/weeklyOffDays";

describe("default weekly off runtime resolution", { skip: process.env.SKIP_DB_TESTS === "1" }, () => {
  let defaultEmployeeId: string;
  let customEmployeeId: string;
  let adminId: string;
  const initialDefault = [0];
  const updatedDefault = [3];

  before(async () => {
    await initSettingsCache();
    const admin = await pool.query<{ id: string }>(
      `SELECT id FROM employees WHERE role = 'admin' AND deleted_at IS NULL LIMIT 1`
    );
    adminId = admin.rows[0]?.id ?? "";
    if (!adminId) throw new Error("Need an admin user for weekly off integration tests");

    const defaultEmployee = await createEmployee({
      employeeCode: `WO-DEF-${Date.now()}`,
      name: "Weekly Off Default Test",
      email: `wo-default-${Date.now()}@example.com`,
      phone: null,
      passwordHash: "test",
      role: "employee",
      createdBy: adminId,
      weeklyOffDays: initialDefault,
      usesDefaultWeeklyOff: true,
    });
    defaultEmployeeId = defaultEmployee.id;

    const customEmployee = await createEmployee({
      employeeCode: `WO-CUS-${Date.now()}`,
      name: "Weekly Off Custom Test",
      email: `wo-custom-${Date.now()}@example.com`,
      phone: null,
      passwordHash: "test",
      role: "employee",
      createdBy: adminId,
      weeklyOffDays: [1],
      usesDefaultWeeklyOff: false,
    });
    customEmployeeId = customEmployee.id;
  });

  after(async () => {
    await pool.query("DELETE FROM employees WHERE id = ANY($1::uuid[])", [
      [defaultEmployeeId, customEmployeeId],
    ]);
    await updateCategory("weeklyOff", { defaultWeeklyOffDays: initialDefault }, adminId);
  });

  it("resolves default employees from current settings without rewriting stored days", async () => {
    await updateCategory("weeklyOff", { defaultWeeklyOffDays: updatedDefault }, adminId);

    const rows = await pool.query<{
      id: string;
      weekly_off_days: number[];
      uses_default_weekly_off: boolean;
    }>(
      `SELECT id, weekly_off_days, uses_default_weekly_off
         FROM employees
        WHERE id = ANY($1::uuid[])`,
      [[defaultEmployeeId, customEmployeeId]]
    );

    const defaultRow = rows.rows.find((row) => row.id === defaultEmployeeId)!;
    const customRow = rows.rows.find((row) => row.id === customEmployeeId)!;

    assert.equal(defaultRow.uses_default_weekly_off, true);
    assert.deepEqual(normalizeWeeklyOffDays(defaultRow.weekly_off_days), initialDefault);
    assert.deepEqual(resolveWeeklyOffDays(defaultRow), updatedDefault);

    assert.equal(customRow.uses_default_weekly_off, false);
    assert.deepEqual(resolveWeeklyOffDays(customRow), [1]);

    const now = new Date();
    const grid = await buildMonthlyGrid({
      year: now.getFullYear(),
      month: now.getMonth() + 1,
    });

    assert.deepEqual(grid.defaultWeeklyOffDays, updatedDefault);

    const defaultEmployeeRow = grid.employees.find((row) => row.employeeId === defaultEmployeeId);
    const customEmployeeRow = grid.employees.find((row) => row.employeeId === customEmployeeId);
    assert.ok(defaultEmployeeRow);
    assert.ok(customEmployeeRow);
    assert.deepEqual(defaultEmployeeRow!.weeklyOffDays, updatedDefault);
    assert.deepEqual(customEmployeeRow!.weeklyOffDays, [1]);
  });
});
