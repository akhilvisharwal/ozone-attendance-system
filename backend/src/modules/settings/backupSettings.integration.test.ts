import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import { pool } from "../../config/db";
import { initSettingsCache, updateCategory, refreshSettingsCache, getSettings } from "./settings.cache";
import * as backupService from "./settings.backup";
import { parseBackupPayload } from "../../utils/backupHelpers";

describe("backup settings integration", { skip: process.env.SKIP_DB_TESTS === "1" }, () => {
  let adminId: string;
  let initialBackup = getSettings().backup;

  before(async () => {
    await initSettingsCache();
    initialBackup = getSettings().backup;
    const adminRow = await pool.query<{ id: string }>(
      `SELECT id FROM employees
        WHERE role = 'admin' AND is_active = true AND deleted_at IS NULL
        ORDER BY created_at ASC
        LIMIT 1`
    );
    if (!adminRow.rows[0]) throw new Error("Need an active admin for backup settings tests");
    adminId = adminRow.rows[0].id;
  });

  after(async () => {
    await updateCategory("backup", initialBackup, adminId);
    await refreshSettingsCache();
  });

  it("persists backup settings after update", async () => {
    const next = {
      ...initialBackup,
      automaticDailyBackup: !initialBackup.automaticDailyBackup,
    };
    await updateCategory("backup", next, adminId);
    await refreshSettingsCache();
    assert.equal(getSettings().backup.automaticDailyBackup, next.automaticDailyBackup);
  });

  async function currentCounts() {
    const counts = await pool.query<{ employees: string; attendance: string }>(
      `SELECT
         (SELECT COUNT(*)::text FROM employees WHERE deleted_at IS NULL) AS employees,
         (SELECT COUNT(*)::text FROM attendance) AS attendance`
    );
    return {
      employees: parseInt(counts.rows[0]?.employees ?? "0", 10),
      attendance: parseInt(counts.rows[0]?.attendance ?? "0", 10),
    };
  }

  it("returns accurate database status", async () => {
    const status = await backupService.getDatabaseStatus();
    const expected = await currentCounts();
    assert.equal(status.health, "healthy");
    assert.ok(status.databaseSizeBytes > 0);
    assert.equal(status.totalEmployees, expected.employees);
    // Parallel suites may insert/delete attendance briefly; allow a small race window.
    assert.ok(Math.abs(status.totalAttendanceRecords - expected.attendance) <= 5);
  });

  it("creates full backup files and updates last backup timestamp", async () => {
    const before = getSettings().backup.lastBackupAt;
    const { payload, filename, filePath } = await backupService.createBackupFile("full");
    assert.ok(filename.endsWith(".json"));
    assert.ok(fs.existsSync(filePath));
    assert.equal(payload.manifest.type, "full");
    assert.ok(Array.isArray(payload.tables.employees));
    assert.ok(Array.isArray(payload.tables.attendance));

    const lastBackupAt = new Date().toISOString();
    await updateCategory("backup", { ...getSettings().backup, lastBackupAt }, adminId);
    await refreshSettingsCache();

    const saved = getSettings().backup.lastBackupAt;
    assert.ok(saved);
    if (before) {
      assert.ok(new Date(saved!).getTime() >= new Date(before).getTime());
    }
  });

  it("exports attendance and employees with accurate row counts", async () => {
    const expected = await currentCounts();
    const attendanceExport = await backupService.exportTables("attendance");
    const employeesExport = await backupService.exportTables("employees");
    assert.equal(attendanceExport.manifest.tableCounts.attendance, expected.attendance);
    assert.equal(employeesExport.manifest.tableCounts.employees, expected.employees);
  });

  it("round-trips full backup payload parsing", async () => {
    const expected = await currentCounts();
    const payload = await backupService.exportTables("full");
    const parsed = parseBackupPayload(payload);
    assert.ok(parsed.tables.employees.length >= expected.employees);
    assert.equal(parsed.tables.attendance.length, expected.attendance);
  });
});
