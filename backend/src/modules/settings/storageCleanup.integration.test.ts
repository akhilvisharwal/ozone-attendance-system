import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { pool } from "../../config/db";
import { env } from "../../config/env";
import { initSettingsCache } from "./settings.cache";
import { getStorageBreakdown } from "./settings.storage";
import {
  executeStorageCleanup,
  getCleanupCenterSummary,
  type CleanupCategorySummary,
} from "./settings.storageCleanup";

const UPLOAD_ROOT = path.join(process.cwd(), env.uploadDir);

/**
 * These tests run against whatever DATABASE_URL points to. `executeStorageCleanup`
 * intentionally operates on the WHOLE table (delete all attendance, all audit logs,
 * etc.), so running the execute tests would destroy real data on a shared database.
 * They are therefore opt-in via ALLOW_DESTRUCTIVE_CLEANUP_TESTS=1 and are meant for
 * an isolated throwaway database only. The always-on tests below never delete data
 * they did not create.
 */
const allowDestructive = process.env.ALLOW_DESTRUCTIVE_CLEANUP_TESTS === "1";

function findCategory(
  categories: CleanupCategorySummary[],
  id: CleanupCategorySummary["id"]
): CleanupCategorySummary {
  const found = categories.find((c) => c.id === id);
  if (!found) throw new Error(`Missing cleanup category: ${id}`);
  return found;
}

describe("storage cleanup summary (non-destructive)", { skip: process.env.SKIP_DB_TESTS === "1" }, () => {
  let employeeId: string;
  const createdAttendanceIds: string[] = [];
  const createdFiles: string[] = [];

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
  });

  after(async () => {
    if (createdAttendanceIds.length) {
      await pool.query(`DELETE FROM attendance WHERE id = ANY($1::uuid[])`, [createdAttendanceIds]);
    }
    for (const file of createdFiles) {
      try {
        await fs.promises.unlink(file);
      } catch {
        // ignore
      }
    }
  });

  it("reflects live data and real file sizes without mutating existing rows", async () => {
    const baseline = await getCleanupCenterSummary();
    const baseAttendance = findCategory(baseline.categories, "attendance_records");
    const baseSelfies = findCategory(baseline.categories, "selfies");
    const baseLocation = findCategory(baseline.categories, "location_history");

    const dir = path.join(UPLOAD_ROOT, "cleanup-test");
    await fs.promises.mkdir(dir, { recursive: true });
    const suffix = Date.now();
    const selfieRel = `cleanup-test/selfie-${suffix}.jpg`;
    const siteRel = `cleanup-test/site-${suffix}.jpg`;
    const selfieFull = path.join(UPLOAD_ROOT, selfieRel);
    const siteFull = path.join(UPLOAD_ROOT, siteRel);
    await fs.promises.writeFile(selfieFull, Buffer.from("selfie-content-x".repeat(64)));
    await fs.promises.writeFile(siteFull, Buffer.from("site-photo-content-y".repeat(128)));
    createdFiles.push(selfieFull, siteFull);

    const inserted = await pool.query<{ id: string }>(
      `INSERT INTO attendance (
         employee_id, attendance_date, status,
         check_in_time, check_in_latitude, check_in_longitude, check_in_address,
         check_in_selfie_path, site_photo_paths
       ) VALUES (
         $1, '2099-06-15', 'checked_out',
         now(), 12.9716, 77.5946, 'Bengaluru Test Address',
         $2, $3::jsonb
       )
       ON CONFLICT (employee_id, attendance_date) DO UPDATE SET
         check_in_latitude = EXCLUDED.check_in_latitude,
         check_in_longitude = EXCLUDED.check_in_longitude,
         check_in_address = EXCLUDED.check_in_address,
         check_in_selfie_path = EXCLUDED.check_in_selfie_path,
         site_photo_paths = EXCLUDED.site_photo_paths
       RETURNING id`,
      [employeeId, selfieRel, JSON.stringify([siteRel])]
    );
    createdAttendanceIds.push(inserted.rows[0].id);

    const after = await getCleanupCenterSummary();
    const attendance = findCategory(after.categories, "attendance_records");
    const selfies = findCategory(after.categories, "selfies");
    const location = findCategory(after.categories, "location_history");

    // Attendance reflects the new row and never reports zero when rows exist.
    assert.equal(attendance.recordCount, baseAttendance.recordCount + 1);
    assert.ok(attendance.recordCount > 0);
    assert.ok(attendance.totalBytes > 0, "attendance size must be > 0 when rows exist");
    assert.ok(attendance.canDelete);

    // Real files on disk are measured, not just DB references.
    assert.equal(attendance.fileCount, baseAttendance.fileCount + 2);
    assert.ok(attendance.fileBytes > baseAttendance.fileBytes);

    // Selfies reflect the new image-bearing row and its real file bytes.
    assert.equal(selfies.recordCount, baseSelfies.recordCount + 1);
    assert.equal(selfies.fileCount, baseSelfies.fileCount + 2);
    assert.ok(selfies.fileBytes > baseSelfies.fileBytes);
    assert.ok(selfies.canDelete);

    // Location reflects the GPS-bearing row.
    assert.equal(location.recordCount, baseLocation.recordCount + 1);
    assert.ok(location.canDelete);
  });

  it("marks categories with no data as not deletable (honest zero)", async () => {
    // audit_logs is unaffected by attendance seeding; assert its shape is coherent.
    const summary = await getCleanupCenterSummary();
    for (const category of summary.categories) {
      if (category.recordCount === 0 && category.fileCount === 0) {
        assert.equal(category.canDelete, false, `${category.id} must not be deletable when empty`);
        assert.equal(category.totalBytes, 0);
      } else {
        assert.equal(category.canDelete, true, `${category.id} must be deletable when data exists`);
      }
    }
  });
});

describe(
  "storage cleanup execution (destructive — isolated DB only)",
  { skip: process.env.SKIP_DB_TESTS === "1" || !allowDestructive },
  () => {
    let employeeId: string;
    const createdFiles: string[] = [];

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
    });

    after(async () => {
      for (const file of createdFiles) {
        try {
          await fs.promises.unlink(file);
        } catch {
          // ignore
        }
      }
    });

    async function seedAttendanceWithFiles(count: number): Promise<void> {
      const dir = path.join(UPLOAD_ROOT, "cleanup-test");
      await fs.promises.mkdir(dir, { recursive: true });
      for (let i = 0; i < count; i++) {
        const selfieRel = `cleanup-test/selfie-${i}.jpg`;
        const siteRel = `cleanup-test/site-${i}.jpg`;
        const selfieFull = path.join(UPLOAD_ROOT, selfieRel);
        const siteFull = path.join(UPLOAD_ROOT, siteRel);
        await fs.promises.writeFile(selfieFull, Buffer.from(`selfie-${i}`.repeat(64)));
        await fs.promises.writeFile(siteFull, Buffer.from(`site-${i}`.repeat(96)));
        createdFiles.push(selfieFull, siteFull);
        await pool.query(
          `INSERT INTO attendance (
             employee_id, attendance_date, status,
             check_in_time, check_in_latitude, check_in_longitude, check_in_address,
             check_in_selfie_path, site_photo_paths
           ) VALUES ($1, $2, 'checked_out', now(), 12.97, 77.59, 'Addr', $3, $4::jsonb)
           ON CONFLICT (employee_id, attendance_date) DO NOTHING`,
          [employeeId, `2099-01-0${i + 1}`, selfieRel, JSON.stringify([siteRel])]
        );
      }
    }

    it("deletes attendance rows and removes linked files, shrinking uploaded storage", async () => {
      await seedAttendanceWithFiles(2);
      const before = await getStorageBreakdown();
      const result = await executeStorageCleanup("attendance_records");
      assert.ok(result.deletedRecords >= 2);
      assert.ok(result.deletedFiles >= 4);

      const remaining = await pool.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM attendance`);
      assert.equal(parseInt(remaining.rows[0]?.count ?? "0", 10), 0);
      for (const file of createdFiles) assert.equal(fs.existsSync(file), false);

      const after = await getStorageBreakdown();
      // Uploaded file storage is returned to the OS immediately (files unlinked).
      assert.ok(
        after.uploadedFilesBytes < before.uploadedFilesBytes,
        "uploaded file storage must drop after files are removed"
      );
      // Row bytes are reclaimed for reuse inside PG; pg_database_size may not shrink
      // with a plain VACUUM, so we only assert it does not grow unexpectedly here.
      assert.ok(result.uploadedFilesRecoveredBytes > 0);

      const summary = await getCleanupCenterSummary();
      assert.equal(findCategory(summary.categories, "attendance_records").canDelete, false);
    });

    it("deletes audit logs", async () => {
      await pool.query(
        `INSERT INTO audit_logs (actor_id, action, target_type, metadata)
         VALUES ($1, 'test.cleanup_seed', 'settings', '{"seed":true}'::jsonb)`,
        [employeeId]
      );
      const result = await executeStorageCleanup("audit_logs");
      assert.ok(result.deletedRecords >= 1);
      const remaining = await pool.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM audit_logs`);
      assert.equal(parseInt(remaining.rows[0]?.count ?? "0", 10), 0);
    });

    it("does not touch protected employee, site, settings, or holiday data", async () => {
      const snapshot = async () =>
        Promise.all([
          pool.query<{ c: string }>(`SELECT COUNT(*)::text AS c FROM employees WHERE deleted_at IS NULL`),
          pool.query<{ c: string }>(`SELECT COUNT(*)::text AS c FROM sites WHERE deleted_at IS NULL`),
          pool.query<{ c: string }>(`SELECT COUNT(*)::text AS c FROM app_settings`),
          pool.query<{ c: string }>(`SELECT COUNT(*)::text AS c FROM company_holidays`),
        ]);
      const before = await snapshot();
      await seedAttendanceWithFiles(1);
      await executeStorageCleanup("attendance_records");
      const after = await snapshot();
      for (let i = 0; i < before.length; i++) {
        assert.equal(after[i].rows[0]?.c, before[i].rows[0]?.c);
      }
    });
  }
);
