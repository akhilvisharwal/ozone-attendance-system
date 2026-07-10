import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { pool } from "../../config/db";
import { initSettingsCache, updateCategory, refreshSettingsCache } from "../settings/settings.cache";
import { createEmployee, findEmployeeById, updateEmployeePassword } from "../employees/employees.repository";
import { generateNextEmployeeCode, generateTemporaryPassword } from "../../utils/employeeCode";
import {
  normalizeEmployeeSettings,
  resolveEmployeeRoleFromSettings,
} from "../../utils/settingsHelpers";
import { getSettings } from "../settings/settings.cache";
import * as designationsRepo from "../employees/designations.repository";

describe("employee settings", { skip: process.env.SKIP_DB_TESTS === "1" }, () => {
  let adminId: string;
  let createdEmployeeId: string | null = null;
  let draftsmanId: string | null = null;
  const initialEmployeeSettings = {
    defaultDesignationId: null as string | null,
    idFormat: "OZN###",
    defaultPassword: "TempPass1",
    requirePasswordChange: true,
    profilePhotoRequired: false,
    activeByDefault: true,
  };

  before(async () => {
    await initSettingsCache();
    const adminRow = await pool.query<{ id: string }>(
      `SELECT id FROM employees
        WHERE role = 'admin' AND is_active = true AND deleted_at IS NULL
        ORDER BY created_at ASC
        LIMIT 1`
    );
    if (!adminRow.rows[0]) throw new Error("Need an active admin for employee settings tests");
    adminId = adminRow.rows[0].id;

    const draftsman = await designationsRepo.findDesignationByName("Draftsman");
    draftsmanId = draftsman?.id ?? null;
  });

  after(async () => {
    if (createdEmployeeId) {
      await pool.query("DELETE FROM employees WHERE id = $1", [createdEmployeeId]);
    }
    await updateCategory("employee", initialEmployeeSettings, adminId);
    await refreshSettingsCache();
  });

  it("normalizes ID prefix format and resolves auth role to employee", () => {
    const normalized = normalizeEmployeeSettings({
      defaultDesignationId: draftsmanId,
      idFormat: "abc##",
      defaultPassword: "Secret1",
      requirePasswordChange: false,
      profilePhotoRequired: true,
      activeByDefault: false,
    });
    assert.equal(normalized.idFormat, "ABC##");
    assert.equal(normalized.defaultDesignationId, draftsmanId);
    assert.equal(resolveEmployeeRoleFromSettings(), "employee");
  });

  it("persists defaultDesignationId and applies employee defaults when creating", async () => {
    assert.ok(draftsmanId, "Draftsman designation should exist");
    const uniquePrefix = `T${String(Date.now()).slice(-5)}`;
    const customSettings = {
      defaultDesignationId: draftsmanId,
      idFormat: `${uniquePrefix}###`,
      defaultPassword: "Welcome9",
      requirePasswordChange: true,
      profilePhotoRequired: true,
      activeByDefault: false,
    };

    await updateCategory("employee", customSettings, adminId);
    await refreshSettingsCache();

    const saved = getSettings().employee;
    assert.equal(saved.idFormat, `${uniquePrefix}###`);
    assert.equal(saved.defaultPassword, "Welcome9");
    assert.equal(saved.activeByDefault, false);
    assert.equal(saved.requirePasswordChange, true);
    assert.equal(saved.profilePhotoRequired, true);
    assert.equal(saved.defaultDesignationId, draftsmanId);

    const employeeCode = await generateNextEmployeeCode();
    assert.match(employeeCode, new RegExp(`^${uniquePrefix}\\d{3}$`));

    const tempPassword = generateTemporaryPassword();
    assert.equal(tempPassword, "Welcome9");

    const passwordHash = await bcrypt.hash(tempPassword, 12);
    const employee = await createEmployee({
      employeeCode,
      name: "Employee Settings Test",
      email: `emp-settings-${Date.now()}@example.com`,
      phone: null,
      passwordHash,
      role: resolveEmployeeRoleFromSettings(),
      createdBy: adminId,
      designationId: saved.defaultDesignationId!,
      firstLoginCompleted: !saved.requirePasswordChange,
      isActive: saved.activeByDefault,
    });
    createdEmployeeId = employee.id;

    assert.equal(employee.employee_code, employeeCode);
    assert.equal(employee.is_active, false);
    assert.equal(employee.first_login_completed, false);
    assert.equal(employee.role, "employee");
    assert.equal(employee.designation_id, draftsmanId);
  });

  it("marks first login complete after the employee sets a new password", async () => {
    assert.ok(createdEmployeeId, "Employee should exist from prior test");
    const row = await findEmployeeById(createdEmployeeId!);
    assert.ok(row);

    const newHash = await bcrypt.hash("NewSecure1", 12);
    await updateEmployeePassword(createdEmployeeId!, newHash, { markFirstLoginComplete: true });

    const updated = await findEmployeeById(createdEmployeeId!);
    assert.equal(updated?.first_login_completed, true);
    const matches = await bcrypt.compare("NewSecure1", updated!.password_hash);
    assert.equal(matches, true);
  });
});
