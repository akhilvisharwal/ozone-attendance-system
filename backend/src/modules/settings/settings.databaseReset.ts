import { pool } from "../../config/db";
import { env } from "../../config/env";
import { ApiError } from "../../utils/errors";
import { storage } from "../../services/storage";
import {
  collectReferencedFilePaths,
  measureUploadDirectoryBytes,
  normalizeRelativePath,
  queryDatabaseSizeBytes,
} from "../../utils/storageAnalytics";
import { getSettings, refreshSettingsCache } from "./settings.cache";

/** Tables cleared during a full application reset (FK-safe child-first order). */
const RESET_DELETE_TABLES = [
  "task_reminder_log",
  "app_notifications",
  "expenses",
  "expense_week_payments",
  "expense_reimbursement_requests",
  "task_extension_requests",
  "task_comments",
  "task_attachments",
  "attendance_daily_override_employees",
  "attendance_daily_overrides",
  "attendance",
  "leave_requests",
  "tasks",
  "company_holidays",
  "sites",
  // audit_logs intentionally preserved so OTP + reset security events remain
  "refresh_tokens",
  "email_otp_challenges",
  "password_reset_tokens",
] as const;

export interface DatabaseResetResult {
  deletedRecords: number;
  deletedFiles: number;
  deletedEmployees: number;
  preservedAdminCode: string;
  databaseSizeBeforeBytes: number;
  databaseSizeAfterBytes: number;
  databaseSizeRecoveredBytes: number;
  uploadedFilesBeforeBytes: number;
  uploadedFilesAfterBytes: number;
  uploadedFilesRecoveredBytes: number;
  tableCounts: Record<string, number>;
}

async function countTable(table: string): Promise<number> {
  const res = await pool.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM ${table}`);
  return parseInt(res.rows[0]?.count ?? "0", 10);
}

async function removeFiles(paths: string[]): Promise<number> {
  let removed = 0;
  for (const relativePath of paths) {
    try {
      await storage.remove(relativePath);
      removed += 1;
    } catch {
      // Best-effort file cleanup — missing files should not abort the reset.
    }
  }
  return removed;
}

/**
 * Hard-resets application data while preserving:
 * - System Administrator account (role=admin, ADMIN_EMPLOYEE_ID)
 * - All app_settings (company, security, attendance, etc.)
 * - employee_designations catalog
 * - Company logo file and admin profile photo (if any)
 */
export async function executeDatabaseReset(): Promise<DatabaseResetResult> {
  const adminCode = env.adminEmployeeId.trim().toUpperCase();
  const settings = getSettings();
  const preservedPaths = new Set<string>();

  const logoPath = normalizeRelativePath(settings.company.logoPath);
  if (logoPath) preservedPaths.add(logoPath);

  const adminRes = await pool.query<{ id: string; profile_photo_path: string | null }>(
    `SELECT id, profile_photo_path
       FROM employees
      WHERE role = 'admin'
        AND UPPER(employee_code) = $1
        AND deleted_at IS NULL
      ORDER BY created_at ASC
      LIMIT 1`,
    [adminCode]
  );
  const admin = adminRes.rows[0];
  if (!admin) {
    throw ApiError.internal(
      `System Administrator account (${adminCode}) was not found — aborting reset.`
    );
  }
  const adminPhoto = normalizeRelativePath(admin.profile_photo_path);
  if (adminPhoto) preservedPaths.add(adminPhoto);

  const referencedBefore = await collectReferencedFilePaths();
  const filesBefore = await measureUploadDirectoryBytes(referencedBefore.allReferenced);
  const databaseSizeBeforeBytes = await queryDatabaseSizeBytes();

  const tableCounts: Record<string, number> = {};
  for (const table of RESET_DELETE_TABLES) {
    tableCounts[table] = await countTable(table);
  }
  const nonAdminEmployees = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
       FROM employees
      WHERE id <> $1`,
    [admin.id]
  );
  const deletedEmployees = parseInt(nonAdminEmployees.rows[0]?.count ?? "0", 10);
  tableCounts.employees_non_admin = deletedEmployees;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL session_replication_role = replica");

    for (const table of RESET_DELETE_TABLES) {
      await client.query(`DELETE FROM ${table}`);
    }

    // Soft-deleted and junior/employee accounts — keep only the System Admin.
    await client.query(`DELETE FROM employees WHERE id <> $1`, [admin.id]);

    // Ensure the preserved admin remains active and usable.
    await client.query(
      `UPDATE employees
          SET is_active = true,
              deleted_at = NULL,
              updated_at = now()
        WHERE id = $1`,
      [admin.id]
    );

    await client.query("SET LOCAL session_replication_role = DEFAULT");
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  const referencedAfter = await collectReferencedFilePaths();
  const pathsToRemove = [...referencedBefore.allReferenced].filter(
    (p) => !referencedAfter.allReferenced.has(p) && !preservedPaths.has(p)
  );
  const deletedFiles = await removeFiles(pathsToRemove);

  for (const table of [
    "attendance",
    "employees",
    "sites",
    "tasks",
    "expenses",
    "audit_logs",
    "leave_requests",
  ]) {
    try {
      await pool.query(`VACUUM ANALYZE ${table}`);
    } catch {
      // managed providers may restrict VACUUM; autovacuum still reclaims space
    }
  }

  await refreshSettingsCache();

  const databaseSizeAfterBytes = await queryDatabaseSizeBytes();
  const referencedFinal = await collectReferencedFilePaths();
  for (const p of preservedPaths) referencedFinal.allReferenced.add(p);
  const filesAfter = await measureUploadDirectoryBytes(referencedFinal.allReferenced);

  const deletedRecords =
    Object.entries(tableCounts)
      .filter(([key]) => key !== "employees_non_admin")
      .reduce((sum, [, count]) => sum + count, 0) + deletedEmployees;

  return {
    deletedRecords,
    deletedFiles,
    deletedEmployees,
    preservedAdminCode: adminCode,
    databaseSizeBeforeBytes,
    databaseSizeAfterBytes,
    databaseSizeRecoveredBytes: Math.max(0, databaseSizeBeforeBytes - databaseSizeAfterBytes),
    uploadedFilesBeforeBytes: filesBefore.totalBytes,
    uploadedFilesAfterBytes: filesAfter.totalBytes,
    uploadedFilesRecoveredBytes: Math.max(0, filesBefore.totalBytes - filesAfter.totalBytes),
    tableCounts,
  };
}
