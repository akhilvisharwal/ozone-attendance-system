import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { pool } from "../../config/db";
import { initSettingsCache, updateCategory, refreshSettingsCache, getSettings } from "../settings/settings.cache";
import { createEmployee, findEmployeeById } from "../employees/employees.repository";
import { generateNextEmployeeCode } from "../../utils/employeeCode";
import { migrateEmployeeIdPrefix } from "../../utils/employeeIdPrefixMigration";

describe(
  "employee ID prefix migration",
  { skip: process.env.SKIP_DB_TESTS === "1" },
  () => {
    let adminId: string;
    let adminOriginalCode: string;
    const createdIds: string[] = [];
    // Letter-only prefixes avoid ambiguity with numeric suffixes.
    const stamp = String(Date.now()).slice(-4);
    const prefixA = `XA${stamp}`;
    const prefixB = `XB${stamp}`;

    const baseSettings = {
      defaultDesignationId: null as string | null,
      idFormat: `${prefixA}###`,
      defaultPassword: "Welcome9",
      requirePasswordChange: false,
      profilePhotoRequired: false,
      activeByDefault: true,
    };

    before(async () => {
      await initSettingsCache();
      const adminRow = await pool.query<{ id: string; employee_code: string }>(
        `SELECT id, employee_code FROM employees
          WHERE role = 'admin' AND is_active = true AND deleted_at IS NULL
          ORDER BY created_at ASC
          LIMIT 1`
      );
      if (!adminRow.rows[0]) throw new Error("Need an active admin for prefix migration tests");
      adminId = adminRow.rows[0].id;
      adminOriginalCode = adminRow.rows[0].employee_code;

      await updateCategory("employee", baseSettings, adminId);
      await refreshSettingsCache();

      await pool.query(`UPDATE employees SET employee_code = $1 WHERE id = $2`, [
        `${prefixA}001`,
        adminId,
      ]);

      const hash = await bcrypt.hash("Welcome9", 12);
      for (const n of [2, 3]) {
        const code = `${prefixA}${String(n).padStart(3, "0")}`;
        const emp = await createEmployee({
          employeeCode: code,
          name: `Prefix Migrate ${n}`,
          email: `prefix-mig-${prefixA}-${n}@example.com`,
          phone: null,
          passwordHash: hash,
          role: "employee",
          createdBy: adminId,
          firstLoginCompleted: true,
          isActive: true,
        });
        createdIds.push(emp.id);
        await pool.query(`UPDATE employees SET profile_photo_path = $1 WHERE id = $2`, [
          `avatars/${code}/photo.jpg`,
          emp.id,
        ]);
      }
    });

    after(async () => {
      for (const id of createdIds) {
        await pool.query("DELETE FROM employees WHERE id = $1", [id]);
      }
      await pool.query(`UPDATE employees SET employee_code = $1 WHERE id = $2`, [
        adminOriginalCode,
        adminId,
      ]);
      await updateCategory(
        "employee",
        {
          defaultDesignationId: null,
          idFormat: "OZN###",
          defaultPassword: "TempPass1",
          requirePasswordChange: true,
          profilePhotoRequired: false,
          activeByDefault: true,
        },
        adminId
      );
      await refreshSettingsCache();
    });

    it("rewrites all employee codes preserving numeric suffixes and continues the sequence", async () => {
      const result = await migrateEmployeeIdPrefix({
        previousIdFormat: `${prefixA}###`,
        newIdFormat: `${prefixB}###`,
        persistEmployeeSettings: { ...baseSettings, idFormat: `${prefixB}###` },
        updatedBy: adminId,
      });
      assert.ok(result);
      assert.equal(result.previousPrefix, prefixA);
      assert.equal(result.nextPrefix, prefixB);
      assert.ok(result.renamedCount >= 3);

      await refreshSettingsCache();
      assert.equal(getSettings().employee.idFormat, `${prefixB}###`);

      const admin = await findEmployeeById(adminId);
      assert.equal(admin?.employee_code, `${prefixB}001`);

      const emp2 = await findEmployeeById(createdIds[0]);
      const emp3 = await findEmployeeById(createdIds[1]);
      assert.equal(emp2?.employee_code, `${prefixB}002`);
      assert.equal(emp3?.employee_code, `${prefixB}003`);
      assert.equal(emp2?.profile_photo_path, `avatars/${prefixB}002/photo.jpg`);
      assert.equal(emp3?.profile_photo_path, `avatars/${prefixB}003/photo.jpg`);

      const old = await pool.query(
        `SELECT id FROM employees WHERE employee_code LIKE $1`,
        [`${prefixA}%`]
      );
      assert.equal(old.rowCount, 0);

      const next = await generateNextEmployeeCode();
      assert.equal(next, `${prefixB}004`);
    });

    it("remaps to the next free number when the preferred ID is already taken", async () => {
      const hash = await bcrypt.hash("Welcome9", 12);

      // Occupant already on target prefix.
      const occupant = await createEmployee({
        employeeCode: `${prefixB}099`,
        name: "Occupant",
        email: `prefix-occupant-${Date.now()}@example.com`,
        phone: null,
        passwordHash: hash,
        role: "employee",
        createdBy: adminId,
        firstLoginCompleted: true,
        isActive: true,
      });
      createdIds.push(occupant.id);

      // Leftover still on old prefix with same numeric suffix.
      const leftover = await createEmployee({
        employeeCode: `${prefixA}099`,
        name: "Leftover",
        email: `prefix-leftover-${Date.now()}@example.com`,
        phone: null,
        passwordHash: hash,
        role: "employee",
        createdBy: adminId,
        firstLoginCompleted: true,
        isActive: true,
      });
      createdIds.push(leftover.id);

      await updateCategory(
        "employee",
        { ...baseSettings, idFormat: `${prefixA}###` },
        adminId
      );
      await refreshSettingsCache();

      const result = await migrateEmployeeIdPrefix({
        previousIdFormat: `${prefixA}###`,
        newIdFormat: `${prefixB}###`,
        persistEmployeeSettings: { ...baseSettings, idFormat: `${prefixB}###` },
        updatedBy: adminId,
      });
      assert.ok(result);
      assert.ok(result.remappedDueToConflictCount >= 1);

      const leftoverAfter = await findEmployeeById(leftover.id);
      assert.equal(leftoverAfter?.employee_code, `${prefixB}100`);

      await refreshSettingsCache();
      assert.equal(getSettings().employee.idFormat, `${prefixB}###`);
    });

    it("persists the new prefix in the same transaction as the rewrite", async () => {
      const prefixC = `XC${stamp}`;
      // Move everyone currently on prefixB back to a fresh prefix while saving settings.
      const before = getSettings().employee;
      const result = await migrateEmployeeIdPrefix({
        previousIdFormat: before.idFormat,
        newIdFormat: `${prefixC}###`,
        persistEmployeeSettings: {
          ...baseSettings,
          idFormat: `${prefixC}###`,
        },
        updatedBy: adminId,
      });
      assert.ok(result);
      assert.ok(result.renamedCount >= 1);

      await refreshSettingsCache();
      assert.equal(getSettings().employee.idFormat, `${prefixC}###`);

      const db = await pool.query<{ value: { idFormat: string } }>(
        `SELECT value FROM app_settings WHERE category = 'employee'`
      );
      assert.equal(db.rows[0]?.value?.idFormat, `${prefixC}###`);
    });
  }
);
