import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { pool } from "../../config/db";
import { initSettingsCache } from "../settings/settings.cache";
import {
  createEmployee,
  findEmployeeById,
  updateEmployeePassword,
  toPublicEmployee,
} from "./employees.repository";
import { logAudit } from "../audit/audit.repository";
import type { Request } from "express";

function mockReq(adminId: string, adminCode: string): Request {
  return {
    user: { id: adminId, employeeCode: adminCode, role: "admin" },
    ip: "203.0.113.50",
    headers: { "user-agent": "ResetPasswordTest/1.0" },
  } as unknown as Request;
}

describe("employee reset password flow", { skip: process.env.SKIP_DB_TESTS === "1" }, () => {
  let adminId: string;
  let adminCode: string;
  let employeeId: string;
  const stamp = Date.now();
  const tempPassword = `TempReset${String(stamp).slice(-4)}A1`;

  before(async () => {
    await initSettingsCache();
    const admin = await pool.query<{ id: string; employee_code: string }>(
      `SELECT id, employee_code FROM employees
        WHERE role = 'admin' AND deleted_at IS NULL
        ORDER BY created_at ASC LIMIT 1`
    );
    if (!admin.rows[0]) throw new Error("Need an admin");
    adminId = admin.rows[0].id;
    adminCode = admin.rows[0].employee_code;

    const employee = await createEmployee({
      employeeCode: `RP${String(stamp).slice(-6)}`,
      name: `Reset PW ${stamp}`,
      email: `reset-pw-${stamp}@example.com`,
      phone: null,
      passwordHash: await bcrypt.hash("OldPass1!", 12),
      role: "employee",
      createdBy: adminId,
      firstLoginCompleted: true,
      isActive: true,
    });
    employeeId = employee.id;
  });

  after(async () => {
    if (employeeId) {
      await pool.query(
        `DELETE FROM audit_logs WHERE target_id = $1 OR actor_id = $1`,
        [employeeId]
      );
      await pool.query("DELETE FROM employees WHERE id = $1", [employeeId]);
    }
  });

  it("stores only bcrypt hashes — no plaintext or ciphertext columns", async () => {
    const cols = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'employees' AND column_name LIKE 'password%'`
    );
    const names = cols.rows.map((r) => r.column_name).sort();
    assert.deepEqual(names, ["password_changed_at", "password_hash"]);

    await updateEmployeePassword(employeeId, await bcrypt.hash(tempPassword, 12), {
      markFirstLoginComplete: true,
    });
    const row = await findEmployeeById(employeeId);
    assert.ok(row);
    assert.equal(await bcrypt.compare(tempPassword, row!.password_hash), true);
    assert.equal(row!.first_login_completed, true);
    assert.equal("password_ciphertext" in (row as object), false);

    const pub = toPublicEmployee(row!);
    assert.equal("password_hash" in pub, false);
  });

  it("logs password resets with admin, employee, IP, and device — never the password", async () => {
    const emp = await findEmployeeById(employeeId);
    await logAudit(
      mockReq(adminId, adminCode),
      "employee.reset_password",
      "employee",
      employeeId,
      {
        direct: true,
        employeeName: emp!.name,
        employeeCode: emp!.employee_code,
        adminCode,
      }
    );

    const logged = await pool.query<{
      action: string;
      status: string;
      ip_address: string | null;
      user_agent: string | null;
      metadata: Record<string, unknown>;
    }>(
      `SELECT action, status, ip_address, user_agent, metadata
         FROM audit_logs
        WHERE action = 'employee.reset_password' AND target_id = $1
        ORDER BY created_at DESC LIMIT 1`,
      [employeeId]
    );

    assert.equal(logged.rows[0]?.action, "employee.reset_password");
    assert.equal(logged.rows[0]?.status, "success");
    assert.equal(logged.rows[0]?.ip_address, "203.0.113.50");
    assert.equal(logged.rows[0]?.user_agent, "ResetPasswordTest/1.0");
    assert.equal(logged.rows[0]?.metadata?.password, undefined);
    assert.equal(logged.rows[0]?.metadata?.temporaryPassword, undefined);
  });

  it("keeps first_login_completed after the employee changes password voluntarily", async () => {
    const next = `NewSecure${String(stamp).slice(-3)}1`;
    await updateEmployeePassword(employeeId, await bcrypt.hash(next, 12), {
      markFirstLoginComplete: true,
    });
    const updated = await findEmployeeById(employeeId);
    assert.equal(updated?.first_login_completed, true);
    assert.equal(await bcrypt.compare(next, updated!.password_hash), true);
    assert.equal(await bcrypt.compare(tempPassword, updated!.password_hash), false);
  });
});
