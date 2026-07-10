import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { pool } from "../../config/db";
import { initSettingsCache } from "../settings/settings.cache";
import {
  createEmployee,
  findEmployeeById,
  updateEmployeePassword,
} from "./employees.repository";

describe("first login password workflow", { skip: process.env.SKIP_DB_TESTS === "1" }, () => {
  let adminId: string;
  let employeeId: string;
  const stamp = Date.now();
  const tempPassword = `FirstLogin${String(stamp).slice(-4)}A1`;
  const userChosenPassword = `Chosen${String(stamp).slice(-4)}B2`;
  const adminResetPassword = `AdminReset${String(stamp).slice(-4)}C3`;

  before(async () => {
    await initSettingsCache();
    const admin = await pool.query<{ id: string }>(
      `SELECT id FROM employees WHERE role = 'admin' AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1`
    );
    if (!admin.rows[0]) throw new Error("Need an admin");
    adminId = admin.rows[0].id;

    const employee = await createEmployee({
      employeeCode: `FL${String(stamp).slice(-6)}`,
      name: `First Login ${stamp}`,
      email: `first-login-${stamp}@example.com`,
      phone: null,
      passwordHash: await bcrypt.hash(tempPassword, 12),
      role: "employee",
      createdBy: adminId,
      firstLoginCompleted: false,
      isActive: true,
    });
    employeeId = employee.id;
  });

  after(async () => {
    if (employeeId) {
      await pool.query(`DELETE FROM audit_logs WHERE target_id = $1 OR actor_id = $1`, [employeeId]);
      await pool.query("DELETE FROM employees WHERE id = $1", [employeeId]);
    }
  });

  it("marks brand-new employees as needing first-login password change", async () => {
    const row = await findEmployeeById(employeeId);
    assert.ok(row);
    assert.equal(row.first_login_completed, false);
    assert.equal(await bcrypt.compare(tempPassword, row.password_hash), true);
  });

  it("completes first login when the employee sets their own password", async () => {
    await updateEmployeePassword(employeeId, await bcrypt.hash(userChosenPassword, 12), {
      markFirstLoginComplete: true,
    });
    const row = await findEmployeeById(employeeId);
    assert.equal(row?.first_login_completed, true);
    assert.equal(await bcrypt.compare(userChosenPassword, row!.password_hash), true);
  });

  it("lets employees log in directly after an admin password reset", async () => {
    await updateEmployeePassword(employeeId, await bcrypt.hash(adminResetPassword, 12), {
      markFirstLoginComplete: true,
    });
    const row = await findEmployeeById(employeeId);
    assert.equal(row?.first_login_completed, true);
    assert.equal(await bcrypt.compare(adminResetPassword, row!.password_hash), true);
    assert.equal(await bcrypt.compare(userChosenPassword, row!.password_hash), false);
  });

  it("does not re-open first-login when an admin changes password without first-login flag", async () => {
    const voluntaryPassword = `Voluntary${String(stamp).slice(-4)}D4`;
    await updateEmployeePassword(employeeId, await bcrypt.hash(voluntaryPassword, 12));
    const row = await findEmployeeById(employeeId);
    assert.equal(row?.first_login_completed, true);
    assert.equal(await bcrypt.compare(voluntaryPassword, row!.password_hash), true);
  });

  it("skips first-login prompt when employee is created with first login already completed", async () => {
    const code = `FLDONE${String(stamp).slice(-4)}`;
    const created = await createEmployee({
      employeeCode: code,
      name: `Skip First Login ${stamp}`,
      email: `skip-first-${stamp}@example.com`,
      phone: null,
      passwordHash: await bcrypt.hash("SkipLogin1", 12),
      role: "employee",
      createdBy: adminId,
      firstLoginCompleted: true,
      isActive: true,
    });
    try {
      const row = await findEmployeeById(created.id);
      assert.equal(row?.first_login_completed, true);
    } finally {
      await pool.query("DELETE FROM employees WHERE id = $1", [created.id]);
    }
  });
});
