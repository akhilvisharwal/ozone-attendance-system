import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../../config/db";
import { initSettingsCache } from "../settings/settings.cache";
import { buildMonthlyGrid } from "./attendance.monthly";
import {
  upsertManualAttendance,
  deleteManualAttendance,
  findAttendanceWithEmployeeByDate,
} from "./attendance.repository";
import { toDateString } from "../../utils/date";

describe("manual attendance integration", { skip: process.env.SKIP_DB_TESTS === "1" }, () => {
  let employeeId: string;
  let adminId: string;
  const testDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 5);
    return toDateString(d);
  })();
  const [year, month] = testDate.split("-").map(Number);

  before(async () => {
    await initSettingsCache();

    const adminRow = await pool.query<{ id: string }>(
      `SELECT id FROM employees
        WHERE role = 'admin' AND is_active = true AND deleted_at IS NULL
        ORDER BY created_at ASC
        LIMIT 1`
    );
    if (!adminRow.rows[0]) throw new Error("Need an active admin for manual attendance tests");
    adminId = adminRow.rows[0].id;

    const employeeRow = await pool.query<{ id: string }>(
      `SELECT id FROM employees
        WHERE role = 'employee' AND is_active = true AND deleted_at IS NULL
        ORDER BY created_at ASC
        LIMIT 1`
    );
    if (!employeeRow.rows[0]) throw new Error("Need an active employee for manual attendance tests");
    employeeId = employeeRow.rows[0].id;

    await deleteManualAttendance(employeeId, testDate);
  });

  after(async () => {
    await deleteManualAttendance(employeeId, testDate);
  });

  function cellForEmployee(grid: Awaited<ReturnType<typeof buildMonthlyGrid>>) {
    const row = grid.employees.find((emp) => emp.employeeId === employeeId);
    assert.ok(row, "Employee row should exist in monthly grid");
    const cell = row.days.find((d) => d.date === testDate);
    assert.ok(cell, "Day cell should exist");
    return cell;
  }

  it("creates manual present and reflects in monthly grid", async () => {
    const record = await upsertManualAttendance({
      employeeId,
      date: testDate,
      status: "present",
      adminId,
      approvedById: adminId,
      reason: "Forgot to check in",
      checkInTime: "09:15",
      checkOutTime: "18:00",
    });

    assert.equal(record.is_admin_marked, true);
    assert.equal(record.admin_mark_status, "present");
    assert.equal(record.admin_approved_by, adminId);
    assert.ok(record.total_minutes && record.total_minutes > 0);

    const grid = await buildMonthlyGrid({ year, month, employeeId });
    const cell = cellForEmployee(grid);
    assert.equal(cell.status, "present");
    assert.ok(cell.totalMinutes && cell.totalMinutes > 0);
  });

  it("updates manual status to leave and overrides automatic calculations", async () => {
    await upsertManualAttendance({
      employeeId,
      date: testDate,
      status: "leave",
      adminId,
      approvedById: adminId,
      reason: "Approved leave recorded manually",
    });

    const enriched = await findAttendanceWithEmployeeByDate(employeeId, testDate);
    assert.ok(enriched);
    assert.equal(enriched.admin_mark_status, "leave");
    assert.equal(enriched.admin_marked_by_name != null, true);

    const grid = await buildMonthlyGrid({ year, month, employeeId });
    const cell = cellForEmployee(grid);
    assert.equal(cell.status, "leave");
  });

  it("deletes manual record so the day reverts to calendar rules", async () => {
    const deleted = await deleteManualAttendance(employeeId, testDate);
    assert.equal(deleted, true);

    const after = await findAttendanceWithEmployeeByDate(employeeId, testDate);
    assert.equal(after, null);

    const grid = await buildMonthlyGrid({ year, month, employeeId });
    const cell = cellForEmployee(grid);
    assert.notEqual(cell.status, "leave");
  });
});
