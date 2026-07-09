import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../../config/db";
import {
  initSettingsCache,
  getSettings,
  refreshSettingsCache,
  updateCategory,
} from "./settings.cache";
import {
  migrateEmployeeIdPrefix,
  prefixesDiffer,
} from "../../utils/employeeIdPrefixMigration";
import { parseIdFormat, generateNextEmployeeCode } from "../../utils/employeeCode";
import { normalizeEmployeeSettings } from "../../utils/settingsHelpers";

describe("employee ID prefix end-to-end", { skip: process.env.SKIP_DB_TESTS === "1" }, () => {
  let adminId: string;

  before(async () => {
    await initSettingsCache();
    const admin = await pool.query<{ id: string }>(
      `SELECT id FROM employees WHERE role = 'admin' AND deleted_at IS NULL LIMIT 1`
    );
    if (!admin.rows[0]) throw new Error("Need an admin");
    adminId = admin.rows[0].id;
  });

  it("persists prefix in settings even when employee codes already use the new prefix", async () => {
    const uniqueA = `PX${Date.now().toString(36).slice(-4).toUpperCase()}`;
    const uniqueB = `QY${Date.now().toString(36).slice(-4).toUpperCase()}`;
    assert.notEqual(uniqueA, uniqueB);

    const base = normalizeEmployeeSettings({
      ...getSettings().employee,
      idFormat: `${uniqueA}###`,
    });
    await updateCategory("employee", base, adminId);
    assert.equal(getSettings().employee.idFormat, `${uniqueA}###`);

    // Simulate desync: codes already on B while settings still say A.
    const emp = await pool.query<{ id: string }>(
      `INSERT INTO employees (employee_code, name, email, password_hash, role, is_active)
       VALUES ($1, 'Prefix Test', $2, 'x', 'employee', true)
       RETURNING id`,
      [`${uniqueB}001`, `prefix-test-${Date.now()}@example.com`]
    );

    try {
      assert.equal(prefixesDiffer(`${uniqueA}###`, `${uniqueB}###`), true);

      const result = await migrateEmployeeIdPrefix({
        previousIdFormat: `${uniqueA}###`,
        newIdFormat: `${uniqueB}###`,
        persistEmployeeSettings: normalizeEmployeeSettings({
          ...base,
          idFormat: `${uniqueB}###`,
        }),
        updatedBy: adminId,
      });
      await refreshSettingsCache();

      assert.ok(result);
      assert.equal(result!.nextPrefix, uniqueB);
      // No rename needed — code already used B — but settings must still save.
      assert.equal(getSettings().employee.idFormat, `${uniqueB}###`);

      const db = await pool.query<{ value: { idFormat: string } }>(
        `SELECT value FROM app_settings WHERE category = 'employee'`
      );
      assert.equal(db.rows[0]?.value?.idFormat, `${uniqueB}###`);

      const nextCode = await generateNextEmployeeCode();
      assert.match(nextCode, new RegExp(`^${uniqueB}\\d+$`));
    } finally {
      await pool.query(`DELETE FROM employees WHERE id = $1`, [emp.rows[0].id]);
      await updateCategory("employee", getSettings().employee, adminId);
      // Restore to whatever was there before this test's unique prefixes by
      // writing a known-good OZN/EMP based on remaining employees is handled
      // by heal script; here just leave current B settings cleaned via restore:
      const restore = normalizeEmployeeSettings({
        ...getSettings().employee,
        idFormat: "OZN###",
      });
      // Detect dominant prefix among remaining employees
      const remaining = await pool.query<{ employee_code: string }>(
        `SELECT employee_code FROM employees WHERE deleted_at IS NULL AND role = 'employee'`
      );
      const counts = new Map<string, number>();
      for (const row of remaining.rows) {
        const m = row.employee_code.match(/^([A-Za-z0-9]+?)(\d+)$/);
        if (!m) continue;
        const p = m[1].toUpperCase();
        counts.set(p, (counts.get(p) ?? 0) + 1);
      }
      let dominant = "OZN";
      let max = 0;
      for (const [p, c] of counts) {
        if (c > max) {
          dominant = p;
          max = c;
        }
      }
      restore.idFormat = `${dominant}###`;
      await updateCategory("employee", restore, adminId);
    }
  });

  it("rewrites codes and persists settings in one transaction (round-trip)", async () => {
    const stamp = Date.now().toString(36).slice(-5).toUpperCase();
    const from = `F${stamp}`;
    const to = `T${stamp}`;
    assert.ok(from.length <= 10 && to.length <= 10);

    const base = normalizeEmployeeSettings({
      ...getSettings().employee,
      idFormat: `${from}###`,
    });
    await updateCategory("employee", base, adminId);

    const emp = await pool.query<{ id: string }>(
      `INSERT INTO employees (employee_code, name, email, password_hash, role, is_active)
       VALUES ($1, 'Round Trip', $2, 'x', 'employee', true)
       RETURNING id`,
      [`${from}007`, `roundtrip-${Date.now()}@example.com`]
    );

    try {
      const result = await migrateEmployeeIdPrefix({
        previousIdFormat: `${from}###`,
        newIdFormat: `${to}###`,
        persistEmployeeSettings: normalizeEmployeeSettings({
          ...base,
          idFormat: `${to}###`,
        }),
        updatedBy: adminId,
      });
      await refreshSettingsCache();

      assert.equal(result?.renamedCount, 1);
      assert.equal(result?.renames[0]?.newCode, `${to}007`);
      assert.equal(getSettings().employee.idFormat, `${to}###`);

      const code = await pool.query<{ employee_code: string }>(
        `SELECT employee_code FROM employees WHERE id = $1`,
        [emp.rows[0].id]
      );
      assert.equal(code.rows[0]?.employee_code, `${to}007`);

      const next = await generateNextEmployeeCode();
      assert.match(next, new RegExp(`^${to}\\d+$`), `expected next code under ${to}, got ${next}`);
      assert.equal(getSettings().employee.idFormat, `${to}###`);
    } finally {
      await pool.query(`DELETE FROM employees WHERE id = $1`, [emp.rows[0].id]);
      const remaining = await pool.query<{ employee_code: string }>(
        `SELECT employee_code FROM employees WHERE deleted_at IS NULL AND role = 'employee'`
      );
      const counts = new Map<string, number>();
      for (const row of remaining.rows) {
        const m = row.employee_code.match(/^([A-Za-z0-9]+?)(\d+)$/);
        if (!m) continue;
        const p = m[1].toUpperCase();
        counts.set(p, (counts.get(p) ?? 0) + 1);
      }
      let dominant = "OZN";
      let max = 0;
      for (const [p, c] of counts) {
        if (c > max) {
          dominant = p;
          max = c;
        }
      }
      await updateCategory(
        "employee",
        normalizeEmployeeSettings({ ...getSettings().employee, idFormat: `${dominant}###` }),
        adminId
      );
    }
  });
});
