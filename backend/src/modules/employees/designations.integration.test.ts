import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../../config/db";
import * as designationsRepo from "./designations.repository";
import {
  createEmployee,
  listEmployees,
  updateEmployeeProfile,
  softDeleteEmployee,
} from "./employees.repository";
import { initSettingsCache, updateCategory, refreshSettingsCache, getSettings } from "../settings/settings.cache";

describe("employee designations", { skip: process.env.SKIP_DB_TESTS === "1" }, () => {
  let adminId: string;
  const createdEmployeeIds: string[] = [];
  const createdDesignationIds: string[] = [];
  const stamp = Date.now();
  let previousDefaultDesignationId: string | null = null;

  before(async () => {
    await initSettingsCache();
    const admin = await pool.query<{ id: string }>(
      `SELECT id FROM employees WHERE role = 'admin' AND deleted_at IS NULL LIMIT 1`
    );
    adminId = admin.rows[0]?.id ?? "";
    if (!adminId) throw new Error("Need an admin user for designation integration tests");
    previousDefaultDesignationId = getSettings().employee.defaultDesignationId ?? null;
  });

  after(async () => {
    if (createdEmployeeIds.length) {
      await pool.query("DELETE FROM employees WHERE id = ANY($1::uuid[])", [createdEmployeeIds]);
    }
    if (createdDesignationIds.length) {
      await pool.query("DELETE FROM employee_designations WHERE id = ANY($1::uuid[])", [
        createdDesignationIds,
      ]);
    }
    await updateCategory(
      "employee",
      {
        ...getSettings().employee,
        defaultDesignationId: previousDefaultDesignationId,
      },
      adminId
    );
    await refreshSettingsCache();
  });

  it("seeds the five default system roles", async () => {
    const items = await designationsRepo.listDesignations();
    const names = new Set(items.filter((d) => d.is_system).map((d) => d.name));
    for (const expected of [
      "Draftsman",
      "Supervisor",
      "Site Worker",
      "Service Incharge",
      "Junior Site Engineer",
    ]) {
      assert.ok(names.has(expected), `missing system role: ${expected}`);
    }
  });

  it("creates a custom role and rejects duplicates (case-insensitive)", async () => {
    const name = `Custom Role ${stamp}`;
    const created = await designationsRepo.createDesignation(name, adminId);
    createdDesignationIds.push(created.id);
    assert.equal(created.name, name);
    assert.equal(created.is_system, false);

    const again = await designationsRepo.findDesignationByName(`  ${name.toUpperCase()}  `);
    assert.ok(again);
    assert.equal(again!.id, created.id);

    await assert.rejects(async () => {
      await designationsRepo.createDesignation(name, adminId);
    }, (err: { code?: string }) => err?.code === "23505");
  });

  it("renames a role", async () => {
    const created = await designationsRepo.createDesignation(`Rename Me ${stamp}`, adminId);
    createdDesignationIds.push(created.id);

    const updated = await designationsRepo.updateDesignation(created.id, `Renamed Role ${stamp}`);
    assert.ok(updated);
    assert.equal(updated!.name, `Renamed Role ${stamp}`);

    const found = await designationsRepo.findDesignationById(created.id);
    assert.equal(found?.name, `Renamed Role ${stamp}`);
  });

  it("creates an employee with a designation and filters/searches by role", async () => {
    const designation = await designationsRepo.findDesignationByName("Draftsman");
    assert.ok(designation);

    const employee = await createEmployee({
      employeeCode: `DES-${stamp}`,
      name: `Designation Test ${stamp}`,
      email: `des-${stamp}@example.com`,
      phone: null,
      passwordHash: "test",
      role: "employee",
      createdBy: adminId,
      designationId: designation!.id,
    });
    createdEmployeeIds.push(employee.id);

    assert.equal(employee.designation_id, designation!.id);
    assert.equal(employee.designation, "Draftsman");

    const filtered = await listEmployees({
      designationId: designation!.id,
      page: 1,
      limit: 100,
    });
    assert.ok(filtered.items.some((e) => e.id === employee.id));

    const searched = await listEmployees({
      search: "Draftsman",
      page: 1,
      limit: 100,
    });
    assert.ok(searched.items.some((e) => e.id === employee.id));
  });

  it("updates an employee designation and leaves unassigned employees null", async () => {
    const supervisor = await designationsRepo.findDesignationByName("Supervisor");
    assert.ok(supervisor);

    const unassigned = await createEmployee({
      employeeCode: `DES-U-${stamp}`,
      name: `Unassigned Role ${stamp}`,
      email: `des-u-${stamp}@example.com`,
      phone: null,
      passwordHash: "test",
      role: "employee",
      createdBy: adminId,
    });
    createdEmployeeIds.push(unassigned.id);
    assert.equal(unassigned.designation_id ?? null, null);
    assert.equal(unassigned.designation ?? null, null);

    const updated = await updateEmployeeProfile(unassigned.id, {
      designationId: supervisor!.id,
    });
    assert.ok(updated);
    assert.equal(updated!.designation_id, supervisor!.id);
    assert.equal(updated!.designation, "Supervisor");
  });

  it("blocks deleting roles in use and allows deleting unused roles", async () => {
    const custom = await designationsRepo.createDesignation(`In Use Role ${stamp}`, adminId);
    createdDesignationIds.push(custom.id);

    const employee = await createEmployee({
      employeeCode: `DES-IU-${stamp}`,
      name: `In Use Role Emp ${stamp}`,
      email: `des-iu-${stamp}@example.com`,
      phone: null,
      passwordHash: "test",
      role: "employee",
      createdBy: adminId,
      designationId: custom.id,
    });
    createdEmployeeIds.push(employee.id);

    const inUseCount = await designationsRepo.countEmployeesWithDesignation(custom.id);
    assert.equal(inUseCount, 1);

    const deletedInUse = await designationsRepo.deleteDesignation(custom.id);
    assert.equal(deletedInUse, false);

    await softDeleteEmployee(employee.id);
    const afterSoftDelete = await designationsRepo.countEmployeesWithDesignation(custom.id);
    assert.equal(afterSoftDelete, 0);

    const deleted = await designationsRepo.deleteDesignation(custom.id);
    assert.equal(deleted, true);
    createdDesignationIds.splice(createdDesignationIds.indexOf(custom.id), 1);
  });

  it("persists defaultDesignationId in employee settings", async () => {
    const role = await designationsRepo.createDesignation(`Default Role ${stamp}`, adminId);
    createdDesignationIds.push(role.id);

    await updateCategory(
      "employee",
      {
        ...getSettings().employee,
        defaultDesignationId: role.id,
      },
      adminId
    );
    await refreshSettingsCache();
    assert.equal(getSettings().employee.defaultDesignationId, role.id);

    await updateCategory(
      "employee",
      {
        ...getSettings().employee,
        defaultDesignationId: null,
      },
      adminId
    );
    await refreshSettingsCache();
    assert.equal(getSettings().employee.defaultDesignationId, null);
  });
});
