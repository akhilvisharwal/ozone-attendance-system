import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../../config/db";
import { initSettingsCache } from "./settings.cache";
import { getStorageBreakdown, runDataCleanup } from "./settings.storage";

async function restoreTableRows(table: string, rows: Record<string, unknown>[]): Promise<void> {
  await pool.query(`DELETE FROM ${table}`);
  for (const row of rows) {
    const cols = Object.keys(row);
    if (!cols.length) continue;
    const values = cols.map((c) => {
      const value = row[c];
      if (value != null && typeof value === "object" && !(value instanceof Date)) {
        return JSON.stringify(value);
      }
      return value;
    });
    const placeholders = cols.map((_, idx) => `$${idx + 1}`).join(", ");
    await pool.query(
      `INSERT INTO ${table} (${cols.map((c) => `"${c}"`).join(", ")})
       VALUES (${placeholders})
       ON CONFLICT DO NOTHING`,
      values
    );
  }
}

describe("storage cleanup integration", { skip: process.env.SKIP_DB_TESTS === "1" }, () => {
  let employeeId: string;
  let siteId: string | null = null;
  let holidayId: string | null = null;
  const createdAttendanceIds: string[] = [];

  before(async () => {
    await initSettingsCache();

    const admin = await pool.query<{ id: string }>(
      `SELECT id FROM employees
        WHERE role = 'admin' AND is_active = true AND deleted_at IS NULL
        ORDER BY created_at ASC
        LIMIT 1`
    );
    if (!admin.rows[0]) throw new Error("Need an active admin for storage cleanup tests");
    employeeId = admin.rows[0].id;

    const site = await pool.query<{ id: string }>(
      `SELECT id FROM sites WHERE deleted_at IS NULL ORDER BY created_at ASC LIMIT 1`
    );
    siteId = site.rows[0]?.id ?? null;

    const holiday = await pool.query<{ id: string }>(
      `SELECT id FROM company_holidays ORDER BY created_at ASC LIMIT 1`
    );
    holidayId = holiday.rows[0]?.id ?? null;
  });

  after(async () => {
    if (createdAttendanceIds.length) {
      await pool.query(`DELETE FROM attendance WHERE id = ANY($1::uuid[])`, [createdAttendanceIds]);
    }
  });

  async function seedDisposableAttendance(): Promise<void> {
    for (let i = 0; i < 2; i++) {
      const date = `2099-01-0${i + 1}`;
      const inserted = await pool.query<{ id: string }>(
        `INSERT INTO attendance (
           employee_id, attendance_date, status,
           check_in_time, check_in_latitude, check_in_longitude, check_in_address,
           check_in_selfie_path, site_photo_paths
         ) VALUES (
           $1, $2, 'checked_out',
           now(), 12.97, 77.59, 'Test Address',
           $3, $4::jsonb
         )
         ON CONFLICT (employee_id, attendance_date) DO UPDATE SET
           check_in_latitude = EXCLUDED.check_in_latitude,
           check_in_longitude = EXCLUDED.check_in_longitude,
           check_in_address = EXCLUDED.check_in_address,
           check_in_selfie_path = EXCLUDED.check_in_selfie_path,
           site_photo_paths = EXCLUDED.site_photo_paths
         RETURNING id`,
        [
          employeeId,
          date,
          `cleanup-test/selfie-${i}.jpg`,
          JSON.stringify([`cleanup-test/site-${i}.jpg`]),
        ]
      );
      createdAttendanceIds.push(inserted.rows[0].id);
    }
  }

  async function assertProtectedUntouched() {
    const employee = await pool.query(`SELECT id FROM employees WHERE id = $1`, [employeeId]);
    assert.equal(employee.rows.length, 1);

    if (siteId) {
      const site = await pool.query(`SELECT id FROM sites WHERE id = $1`, [siteId]);
      assert.equal(site.rows.length, 1);
    }
    if (holidayId) {
      const holiday = await pool.query(`SELECT id FROM company_holidays WHERE id = $1`, [holidayId]);
      assert.equal(holiday.rows.length, 1);
    }

    const settings = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM app_settings`
    );
    assert.ok(parseInt(settings.rows[0]?.count ?? "0", 10) >= 1);

    const leaveSettings = await pool.query(
      `SELECT value FROM app_settings WHERE category = 'leave'`
    );
    assert.equal(leaveSettings.rows.length, 1);

    const weeklyOff = await pool.query(
      `SELECT value FROM app_settings WHERE category = 'weeklyOff'`
    );
    assert.equal(weeklyOff.rows.length, 1);
  }

  it("returns storage breakdown with categories and cleanup previews", async () => {
    await seedDisposableAttendance();
    const storage = await getStorageBreakdown();
    assert.ok(storage.databaseSizeBytes > 0);
    assert.ok(storage.capacity);
    assert.ok(["provider", "env", "unavailable"].includes(storage.capacity.limitSource));
    if (storage.capacity.detected) {
      assert.ok((storage.capacity.maxBytes ?? 0) > 0);
    } else {
      assert.equal(storage.capacity.maxBytes, null);
    }
    assert.equal(storage.capacity.usedBytes, storage.databaseSizeBytes);
    assert.ok(storage.categories.some((c) => c.id === "settings"));
    assert.ok(storage.categories.some((c) => c.id === "location"));
    assert.ok(storage.categories.length >= 8);
    for (const category of storage.categories) {
      assert.ok(typeof category.recordCount === "number");
      assert.ok(category.sizeLabel.length > 0);
    }
    assert.ok(storage.tables.length >= 5);
    assert.ok(storage.cleanupPreview.attendance_records.affectedRecords >= 2);
    assert.ok(storage.cleanupPreview.attendance_selfies.affectedRecords >= 2);
    assert.ok(storage.cleanupPreview.attendance_location.affectedRecords >= 2);
    assert.ok(storage.cleanupPreview.audit_logs.affectedRecords >= 0);
  });

  it("clears selfie paths only without deleting attendance or protected data", async () => {
    await seedDisposableAttendance();
    const snapshot = await pool.query(`SELECT * FROM attendance`);
    const beforeAttendance = snapshot.rows.length;

    try {
      const result = await runDataCleanup("attendance_selfies");
      assert.ok(result.deletedRecords >= 2);

      const selfieRows = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
           FROM attendance
          WHERE check_in_selfie_path IS NOT NULL
             OR (site_photo_paths IS NOT NULL AND site_photo_paths <> '[]'::jsonb)`
      );
      assert.equal(parseInt(selfieRows.rows[0]?.count ?? "0", 10), 0);

      const afterAttendance = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM attendance`
      );
      assert.equal(parseInt(afterAttendance.rows[0]?.count ?? "0", 10), beforeAttendance);
      await assertProtectedUntouched();
    } finally {
      await restoreTableRows("attendance", snapshot.rows as Record<string, unknown>[]);
    }
  });

  it("clears location history only without deleting attendance or protected data", async () => {
    await seedDisposableAttendance();
    const snapshot = await pool.query(`SELECT * FROM attendance`);
    const beforeAttendance = snapshot.rows.length;

    try {
      const result = await runDataCleanup("attendance_location");
      assert.ok(result.deletedRecords >= 2);

      const locationRows = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
           FROM attendance
          WHERE check_in_latitude IS NOT NULL
             OR check_in_longitude IS NOT NULL
             OR check_in_address IS NOT NULL
             OR check_out_latitude IS NOT NULL
             OR check_out_longitude IS NOT NULL
             OR check_out_address IS NOT NULL
             OR check_out_gps_accuracy IS NOT NULL`
      );
      assert.equal(parseInt(locationRows.rows[0]?.count ?? "0", 10), 0);

      const afterAttendance = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM attendance`
      );
      assert.equal(parseInt(afterAttendance.rows[0]?.count ?? "0", 10), beforeAttendance);
      await assertProtectedUntouched();
    } finally {
      await restoreTableRows("attendance", snapshot.rows as Record<string, unknown>[]);
    }
  });

  it("deletes audit logs only and leaves protected data intact", async () => {
    const snapshot = await pool.query(`SELECT * FROM audit_logs`);
    await pool.query(
      `INSERT INTO audit_logs (actor_id, action, target_type, metadata)
       VALUES ($1, 'test.cleanup_seed', 'settings', '{"seed":true}'::jsonb)`,
      [employeeId]
    );

    try {
      const before = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM audit_logs`
      );
      assert.ok(parseInt(before.rows[0]?.count ?? "0", 10) >= 1);

      const result = await runDataCleanup("audit_logs");
      assert.ok(result.deletedRecords >= 1);

      const after = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM audit_logs`
      );
      assert.equal(parseInt(after.rows[0]?.count ?? "0", 10), 0);
      await assertProtectedUntouched();
    } finally {
      await restoreTableRows("audit_logs", snapshot.rows as Record<string, unknown>[]);
    }
  });

  it("deletes attendance records and refreshes storage counts without touching protected data", async () => {
    const snapshot = await pool.query(`SELECT * FROM attendance`);
    await seedDisposableAttendance();

    const beforeStorage = await getStorageBreakdown();
    assert.ok(beforeStorage.cleanupPreview.attendance_bundle.affectedRecords >= 1);

    try {
      const result = await runDataCleanup("attendance_bundle");
      assert.ok(result.deletedRecords >= 1);

      const attendanceCount = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM attendance`
      );
      assert.equal(parseInt(attendanceCount.rows[0]?.count ?? "0", 10), 0);

      const afterStorage = await getStorageBreakdown();
      assert.equal(afterStorage.cleanupPreview.attendance_records.affectedRecords, 0);
      assert.equal(afterStorage.cleanupPreview.attendance_selfies.affectedRecords, 0);
      assert.equal(afterStorage.cleanupPreview.attendance_location.affectedRecords, 0);
      await assertProtectedUntouched();
    } finally {
      await restoreTableRows("attendance", snapshot.rows as Record<string, unknown>[]);
    }
  });
});
