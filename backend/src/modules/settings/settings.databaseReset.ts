import type { PoolClient } from "pg";
import { pool } from "../../config/db";
import { env } from "../../config/env";
import { ApiError } from "../../utils/errors";
import {
  collectReferencedFilePaths,
  maintainDatabaseAfterWipe,
  measureUploadDirectoryBytes,
  normalizeRelativePath,
  purgeUploadFilesExcept,
  queryDatabaseSizeBytes,
  queryDatabaseSpaceBreakdown,
  queryExactTableStats,
} from "../../utils/storageAnalytics";
import { getSettings, refreshSettingsCache } from "./settings.cache";

/**
 * Tables cleared during a full application reset (FK-safe child-first order).
 * Intentionally NOT cleared here:
 * - app_settings / employee_designations (protected system configuration)
 * - audit_logs (OTP + reset security trail — actor_id reassigned to System Admin)
 * - refresh_tokens for the preserved System Admin
 * - email_otp_challenges / password_reset_tokens (cleared at end of successful tx)
 */
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
] as const;

const MAINTENANCE_TABLES = [
  ...RESET_DELETE_TABLES,
  "employees",
  "refresh_tokens",
  "email_otp_challenges",
  "password_reset_tokens",
  "audit_logs",
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
  physicalDatabaseBytes: number;
  liveDataBytes: number;
  reclaimableBytes: number;
  vacuumedTables: string[];
  vacuumFullTables: string[];
  remainingOperationalRows: Record<string, number>;
  remainingUploadFiles: number;
  tableCounts: Record<string, number>;
}

export interface DatabaseResetOtpHandles {
  /** Step-2 email OTP challenge id — deleted only after a successful wipe. */
  step2ChallengeId: string;
  /** Authorization ticket challenge id — deleted only after a successful wipe. */
  authorizationId: string;
}

function logReset(step: string, detail?: Record<string, unknown>): void {
  const suffix = detail ? ` ${JSON.stringify(detail)}` : "";
  console.info(`[database-reset] ${step}${suffix}`);
}

async function countTable(client: PoolClient | typeof pool, table: string): Promise<number> {
  const res = await client.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM ${table}`);
  return parseInt(res.rows[0]?.count ?? "0", 10);
}

/**
 * Re-point or clear FK columns that would block deleting non-admin employees.
 * Managed Postgres (Neon/Render) often forbids session_replication_role=replica,
 * so we must satisfy constraints explicitly.
 */
async function clearEmployeeForeignKeys(client: PoolClient, adminId: string): Promise<void> {
  const audit = await client.query(
    `UPDATE audit_logs
        SET actor_id = $1
      WHERE actor_id IS NOT NULL
        AND actor_id IS DISTINCT FROM $1`,
    [adminId]
  );
  logReset("FK: audit_logs.actor_id reassigned to System Admin", {
    rows: audit.rowCount ?? 0,
  });

  const settings = await client.query(
    `UPDATE app_settings
        SET updated_by = $1
      WHERE updated_by IS DISTINCT FROM $1`,
    [adminId]
  );
  logReset("FK: app_settings.updated_by reassigned", { rows: settings.rowCount ?? 0 });

  const designations = await client.query(
    `UPDATE employee_designations
        SET created_by = $1
      WHERE created_by IS NOT NULL
        AND created_by IS DISTINCT FROM $1`,
    [adminId]
  );
  logReset("FK: employee_designations.created_by reassigned", {
    rows: designations.rowCount ?? 0,
  });

  const selfRefs = await client.query(
    `UPDATE employees SET created_by = NULL WHERE created_by IS NOT NULL`
  );
  logReset("FK: employees.created_by cleared", { rows: selfRefs.rowCount ?? 0 });
}

/**
 * Hard-resets application data while preserving:
 * - System Administrator account (role=admin, ADMIN_EMPLOYEE_ID)
 * - All app_settings (company, security, attendance, etc.)
 * - employee_designations catalog
 * - Company logo file and admin profile photo (if any)
 * - audit_logs (security trail)
 * - uploads/backups/ (admin backup downloads)
 */
export async function executeDatabaseReset(
  otpHandles?: DatabaseResetOtpHandles
): Promise<DatabaseResetResult> {
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

  logReset("System Admin resolved", { adminId: admin.id, adminCode });
  logReset("Preserved upload paths", { paths: [...preservedPaths] });

  const referencedBefore = await collectReferencedFilePaths();
  const filesBefore = await measureUploadDirectoryBytes(referencedBefore.allReferenced);
  const databaseSizeBeforeBytes = await queryDatabaseSizeBytes();
  logReset("Pre-reset storage snapshot", {
    databaseSizeBeforeBytes,
    uploadedFilesBeforeBytes: filesBefore.totalBytes,
    orphanedUploadBytes: filesBefore.unreferencedBytes,
    orphanedUploadCount: filesBefore.unreferencedCount,
  });

  const tableCounts: Record<string, number> = {};
  for (const table of RESET_DELETE_TABLES) {
    tableCounts[table] = await countTable(pool, table);
  }
  tableCounts.email_otp_challenges = await countTable(pool, "email_otp_challenges");
  tableCounts.password_reset_tokens = await countTable(pool, "password_reset_tokens");

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
    logReset("Transaction started");
    await client.query("BEGIN");

    for (const table of RESET_DELETE_TABLES) {
      const del = await client.query(`DELETE FROM ${table}`);
      logReset(`Table deleted: ${table}`, { rows: del.rowCount ?? 0 });
    }

    const tokens = await client.query(`DELETE FROM refresh_tokens WHERE employee_id <> $1`, [
      admin.id,
    ]);
    logReset("Table deleted: refresh_tokens (non-admin)", { rows: tokens.rowCount ?? 0 });

    await clearEmployeeForeignKeys(client, admin.id);

    const empDel = await client.query(`DELETE FROM employees WHERE id <> $1`, [admin.id]);
    logReset("Non-admin employees deleted", { rows: empDel.rowCount ?? 0 });

    await client.query(
      `UPDATE employees
          SET is_active = true,
              deleted_at = NULL,
              updated_at = now()
        WHERE id = $1`,
      [admin.id]
    );
    logReset("System Admin reactivated");

    const otpDel = await client.query(`DELETE FROM email_otp_challenges`);
    logReset("Table deleted: email_otp_challenges", { rows: otpDel.rowCount ?? 0 });
    const resetDel = await client.query(`DELETE FROM password_reset_tokens`);
    logReset("Table deleted: password_reset_tokens", { rows: resetDel.rowCount ?? 0 });

    if (otpHandles) {
      logReset("OTP handles invalidated inside successful transaction", {
        step2ChallengeId: otpHandles.step2ChallengeId,
        authorizationId: otpHandles.authorizationId,
      });
    }

    await client.query("COMMIT");
    logReset("Transaction committed");
  } catch (err) {
    console.error("[database-reset] Transaction failed — rolling back", err);
    try {
      await client.query("ROLLBACK");
      logReset("Transaction rolled back");
    } catch (rollbackErr) {
      console.error("[database-reset] ROLLBACK failed", rollbackErr);
    }
    const message = err instanceof Error ? err.message : String(err);
    throw ApiError.internal(`Database reset failed: ${message}`);
  } finally {
    client.release();
  }

  // Verify operational tables are empty (except protected ones).
  const remainingOperationalRows: Record<string, number> = {};
  for (const table of RESET_DELETE_TABLES) {
    remainingOperationalRows[table] = await countTable(pool, table);
  }
  remainingOperationalRows.employees = await countTable(pool, "employees");
  remainingOperationalRows.email_otp_challenges = await countTable(pool, "email_otp_challenges");
  remainingOperationalRows.password_reset_tokens = await countTable(pool, "password_reset_tokens");
  logReset("Post-commit row verification", remainingOperationalRows);

  const unexpected = Object.entries(remainingOperationalRows).filter(([table, count]) => {
    if (table === "employees") return count !== 1;
    return count !== 0;
  });
  if (unexpected.length > 0) {
    console.error("[database-reset] Unexpected remaining rows after wipe", unexpected);
  }

  logReset("Purging upload files (except logo, admin photo, backups/)");
  const purge = await purgeUploadFilesExcept(preservedPaths);
  logReset("Files removed", {
    deletedFiles: purge.deletedFiles,
    recoveredBytes: purge.recoveredBytes,
    remainingFiles: purge.remainingFiles,
  });

  logReset("Running database maintenance (VACUUM ANALYZE + VACUUM FULL on empty tables)");
  const maintenance = await maintainDatabaseAfterWipe([...MAINTENANCE_TABLES]);
  logReset("Database maintenance complete", {
    vacuumed: maintenance.vacuumed,
    vacuumFull: maintenance.vacuumFull,
    skipped: maintenance.skipped,
  });

  await refreshSettingsCache();
  logReset("Settings cache refreshed");

  const exactTables = await queryExactTableStats();
  const space = await queryDatabaseSpaceBreakdown(exactTables);
  const referencedFinal = await collectReferencedFilePaths();
  for (const p of preservedPaths) referencedFinal.allReferenced.add(p);
  const filesAfter = await measureUploadDirectoryBytes(referencedFinal.allReferenced);
  const databaseSizeAfterBytes = space.physicalDatabaseBytes;

  const deletedRecords =
    Object.entries(tableCounts)
      .filter(([key]) => key !== "employees_non_admin")
      .reduce((sum, [, count]) => sum + count, 0) + deletedEmployees;

  logReset("Storage recalculated", {
    physicalDatabaseBytes: space.physicalDatabaseBytes,
    liveDataBytes: space.liveDataBytes,
    reclaimableBytes: space.reclaimableBytes,
    uploadedFilesAfterBytes: filesAfter.totalBytes,
    orphanedUploadBytes: filesAfter.unreferencedBytes,
  });

  logReset("Reset complete", {
    deletedRecords,
    deletedFiles: purge.deletedFiles,
    deletedEmployees,
    preservedAdminCode: adminCode,
  });

  return {
    deletedRecords,
    deletedFiles: purge.deletedFiles,
    deletedEmployees,
    preservedAdminCode: adminCode,
    databaseSizeBeforeBytes,
    databaseSizeAfterBytes,
    databaseSizeRecoveredBytes: Math.max(0, databaseSizeBeforeBytes - databaseSizeAfterBytes),
    uploadedFilesBeforeBytes: filesBefore.totalBytes,
    uploadedFilesAfterBytes: filesAfter.totalBytes,
    uploadedFilesRecoveredBytes: Math.max(0, filesBefore.totalBytes - filesAfter.totalBytes),
    physicalDatabaseBytes: space.physicalDatabaseBytes,
    liveDataBytes: space.liveDataBytes,
    reclaimableBytes: space.reclaimableBytes,
    vacuumedTables: maintenance.vacuumed,
    vacuumFullTables: maintenance.vacuumFull,
    remainingOperationalRows,
    remainingUploadFiles: purge.remainingFiles,
    tableCounts,
  };
}
