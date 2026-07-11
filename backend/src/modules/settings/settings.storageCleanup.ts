import { pool } from "../../config/db";
import {
  countArchivedExpenseRecords,
  deleteArchivedExpenseData,
} from "../expenses/expenses.requests.repository";
import { storage } from "../../services/storage";
import { formatDatabaseSize } from "../../utils/backupHelpers";
import {
  collectReferencedFilePaths,
  maintainDatabaseAfterWipe,
  measureUploadDirectoryBytes,
  normalizeRelativePath,
  purgeUploadFilesExcept,
  queryDatabaseSizeBytes,
} from "../../utils/storageAnalytics";
import { getSettings } from "./settings.cache";

export type CleanupCategory =
  | "attendance_records"
  | "selfies"
  | "location_history"
  | "audit_logs"
  | "archived_expenses";

export interface CleanupCategorySummary {
  id: CleanupCategory;
  label: string;
  description: string;
  recordCount: number;
  fileCount: number;
  databaseBytes: number;
  databaseLabel: string;
  fileBytes: number;
  fileLabel: string;
  totalBytes: number;
  totalLabel: string;
  canDelete: boolean;
}

export interface CleanupCenterSummary {
  categories: CleanupCategorySummary[];
  totalRecoverableBytes: number;
  totalRecoverableLabel: string;
  totalRecords: number;
  totalFiles: number;
}

export interface CleanupResult {
  category: CleanupCategory;
  deletedRecords: number;
  deletedFiles: number;
  databaseSizeBeforeBytes: number;
  databaseSizeAfterBytes: number;
  databaseSizeRecoveredBytes: number;
  uploadedFilesBeforeBytes: number;
  uploadedFilesAfterBytes: number;
  uploadedFilesRecoveredBytes: number;
  details: Record<string, number>;
}

export const CLEANUP_CATEGORIES: CleanupCategory[] = [
  "attendance_records",
  "selfies",
  "location_history",
  "audit_logs",
  "archived_expenses",
];

const CATEGORY_META: Record<
  CleanupCategory,
  { label: string; description: string }
> = {
  attendance_records: {
    label: "Attendance Records",
    description:
      "Permanently delete all attendance rows and remove linked selfie and site photo files from storage.",
  },
  selfies: {
    label: "Selfies",
    description:
      "Remove selfie and site photo files from storage and clear their paths on attendance records.",
  },
  location_history: {
    label: "Location History",
    description:
      "Clear GPS coordinates and addresses from attendance records without deleting the rows.",
  },
  audit_logs: {
    label: "Audit Logs",
    description: "Permanently delete all administrative audit log entries.",
  },
  archived_expenses: {
    label: "Archived Expenses",
    description:
      "Permanently delete archived expense line items and reimbursement requests (paid/archived only). Linked receipt images and PDFs are removed from storage.",
  },
};

const SELFIE_WHERE = `(
  check_in_selfie_path IS NOT NULL
  OR (site_photo_paths IS NOT NULL AND site_photo_paths <> '[]'::jsonb)
)`;

const LOCATION_WHERE = `(
  check_in_latitude IS NOT NULL
  OR check_in_longitude IS NOT NULL
  OR check_in_address IS NOT NULL
  OR check_out_latitude IS NOT NULL
  OR check_out_longitude IS NOT NULL
  OR check_out_address IS NOT NULL
)`;

function parseSitePhotoPaths(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

async function tableSizeBytes(table: string): Promise<number> {
  const res = await pool.query<{ bytes: string }>(
    `SELECT COALESCE(pg_total_relation_size($1::regclass), 0)::text AS bytes`,
    [table]
  );
  return parseInt(res.rows[0]?.bytes ?? "0", 10);
}

async function countRows(table: string, whereSql = "TRUE"): Promise<number> {
  const res = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM ${table} WHERE ${whereSql}`
  );
  return parseInt(res.rows[0]?.count ?? "0", 10);
}

async function proportionalTableBytes(
  table: string,
  matchCount: number
): Promise<number> {
  if (matchCount <= 0) return 0;
  const [total, sizeBytes] = await Promise.all([
    countRows(table),
    tableSizeBytes(table),
  ]);
  if (total <= 0 || sizeBytes <= 0) return 0;
  return Math.round((matchCount / total) * sizeBytes);
}

async function collectAttendanceImagePaths(whereSql: string): Promise<string[]> {
  const res = await pool.query<{
    check_in_selfie_path: string | null;
    site_photo_paths: unknown;
  }>(`SELECT check_in_selfie_path, site_photo_paths FROM attendance WHERE ${whereSql}`);
  const paths: string[] = [];
  for (const row of res.rows) {
    const selfie = normalizeRelativePath(row.check_in_selfie_path);
    if (selfie) paths.push(selfie);
    for (const photo of parseSitePhotoPaths(row.site_photo_paths)) {
      const normalized = normalizeRelativePath(photo);
      if (normalized) paths.push(normalized);
    }
  }
  return [...new Set(paths)];
}

async function sumFileSizes(paths: string[]): Promise<{ fileCount: number; bytes: number }> {
  let bytes = 0;
  let fileCount = 0;
  await Promise.all(
    paths.map(async (relativePath) => {
      const size = await storage.statSize(relativePath);
      if (size == null) return;
      bytes += size;
      fileCount += 1;
    })
  );
  return { fileCount, bytes };
}

async function measureUploadedFilesBytes(): Promise<number> {
  const referenced = await collectReferencedFilePaths();
  const disk = await measureUploadDirectoryBytes(referenced.allReferenced);
  return disk.totalBytes;
}

async function removeFiles(paths: string[]): Promise<number> {
  let removed = 0;
  for (const relativePath of paths) {
    try {
      await storage.remove(relativePath);
      removed += 1;
    } catch {
      // ignore missing files
    }
  }
  return removed;
}

async function vacuumTables(tables: string[]): Promise<void> {
  await maintainDatabaseAfterWipe(tables);
}

async function purgeOrphanUploadsPreservingSystemFiles(): Promise<number> {
  const settings = getSettings();
  const preserved = new Set<string>();
  const logo = normalizeRelativePath(settings.company.logoPath);
  if (logo) preserved.add(logo);

  const admin = await pool.query<{ profile_photo_path: string | null }>(
    `SELECT profile_photo_path FROM employees
      WHERE role = 'admin' AND deleted_at IS NULL
      ORDER BY created_at ASC LIMIT 1`
  );
  const photo = normalizeRelativePath(admin.rows[0]?.profile_photo_path);
  if (photo) preserved.add(photo);

  // Keep every path still referenced by live rows — only true orphans are removed.
  const referenced = await collectReferencedFilePaths();
  for (const path of referenced.allReferenced) preserved.add(path);

  const purge = await purgeUploadFilesExcept(preserved);
  return purge.deletedFiles;
}

function toSummary(
  id: CleanupCategory,
  recordCount: number,
  fileCount: number,
  databaseBytes: number,
  fileBytes: number
): CleanupCategorySummary {
  const totalBytes = databaseBytes + fileBytes;
  const canDelete = recordCount > 0 || fileCount > 0;
  return {
    id,
    label: CATEGORY_META[id].label,
    description: CATEGORY_META[id].description,
    recordCount,
    fileCount,
    databaseBytes,
    databaseLabel: formatDatabaseSize(databaseBytes),
    fileBytes,
    fileLabel: formatDatabaseSize(fileBytes),
    totalBytes,
    totalLabel: formatDatabaseSize(totalBytes),
    canDelete,
  };
}

async function summarizeAttendanceRecords(): Promise<CleanupCategorySummary> {
  const recordCount = await countRows("attendance");
  const databaseBytes = recordCount > 0 ? await tableSizeBytes("attendance") : 0;
  const paths = recordCount > 0 ? await collectAttendanceImagePaths("TRUE") : [];
  const files = await sumFileSizes(paths);
  return toSummary("attendance_records", recordCount, files.fileCount, databaseBytes, files.bytes);
}

async function summarizeSelfies(): Promise<CleanupCategorySummary> {
  const recordCount = await countRows("attendance", SELFIE_WHERE);
  const paths = recordCount > 0 ? await collectAttendanceImagePaths(SELFIE_WHERE) : [];
  const files = await sumFileSizes(paths);
  // Path columns are a small share of attendance rows; use live proportional table size.
  const databaseBytes =
    recordCount > 0 ? Math.round((await proportionalTableBytes("attendance", recordCount)) * 0.15) : 0;
  return toSummary("selfies", recordCount, files.fileCount, databaseBytes, files.bytes);
}

async function summarizeLocationHistory(): Promise<CleanupCategorySummary> {
  const recordCount = await countRows("attendance", LOCATION_WHERE);
  const databaseBytes =
    recordCount > 0 ? Math.round((await proportionalTableBytes("attendance", recordCount)) * 0.2) : 0;
  return toSummary("location_history", recordCount, 0, databaseBytes, 0);
}

async function summarizeAuditLogs(): Promise<CleanupCategorySummary> {
  const recordCount = await countRows("audit_logs");
  const databaseBytes = recordCount > 0 ? await tableSizeBytes("audit_logs") : 0;
  return toSummary("audit_logs", recordCount, 0, databaseBytes, 0);
}

async function summarizeArchivedExpenses(): Promise<CleanupCategorySummary> {
  const archived = await countArchivedExpenseRecords();
  // Primary count = archived expense line items (plus request headers for transparency).
  const recordCount = archived.expenseCount + archived.requestCount;
  const uniquePaths = [
    ...new Set(
      archived.receiptPaths
        .map((p) => normalizeRelativePath(p))
        .filter((p): p is string => Boolean(p))
    ),
  ];
  const files = await sumFileSizes(uniquePaths);

  const [reqDbBytes, expDbBytes] = await Promise.all([
    proportionalTableBytes("expense_reimbursement_requests", archived.requestCount),
    proportionalTableBytes("expenses", archived.expenseCount),
  ]);
  const databaseBytes = reqDbBytes + expDbBytes;

  return toSummary("archived_expenses", recordCount, files.fileCount, databaseBytes, files.bytes);
}

async function summarizeOrThrow(
  id: CleanupCategory,
  fn: () => Promise<CleanupCategorySummary>
): Promise<CleanupCategorySummary> {
  try {
    return await fn();
  } catch (err) {
    // Never silently return zero — surface the real query failure to the caller
    // and the server logs so a broken statistic is diagnosable.
    console.error(`[storage-cleanup] Failed to summarize "${id}":`, err);
    throw new Error(
      `Failed to read live storage statistics for "${id}": ${(err as Error).message}`
    );
  }
}

export async function getCleanupCenterSummary(): Promise<CleanupCenterSummary> {
  const categories = await Promise.all([
    summarizeOrThrow("attendance_records", summarizeAttendanceRecords),
    summarizeOrThrow("selfies", summarizeSelfies),
    summarizeOrThrow("location_history", summarizeLocationHistory),
    summarizeOrThrow("audit_logs", summarizeAuditLogs),
    summarizeOrThrow("archived_expenses", summarizeArchivedExpenses),
  ]);

  const attendance = categories.find((c) => c.id === "attendance_records");
  const selfies = categories.find((c) => c.id === "selfies");
  const location = categories.find((c) => c.id === "location_history");
  const audit = categories.find((c) => c.id === "audit_logs");
  const archivedExpenses = categories.find((c) => c.id === "archived_expenses");

  // Attendance rows include selfie files and location columns. Count that table once.
  // If attendance is already empty, fall back to remaining selfie/location totals.
  const totalRecoverableBytes =
    (audit?.totalBytes ?? 0) +
    (archivedExpenses?.totalBytes ?? 0) +
    (attendance && attendance.recordCount > 0
      ? attendance.totalBytes
      : (selfies?.totalBytes ?? 0) + (location?.totalBytes ?? 0));

  return {
    categories,
    totalRecoverableBytes,
    totalRecoverableLabel: formatDatabaseSize(totalRecoverableBytes),
    totalRecords: categories.reduce((sum, c) => sum + c.recordCount, 0),
    totalFiles:
      Math.max(attendance?.fileCount ?? 0, selfies?.fileCount ?? 0) +
      (archivedExpenses?.fileCount ?? 0),
  };
}

export async function executeStorageCleanup(category: CleanupCategory): Promise<CleanupResult> {
  if (!CLEANUP_CATEGORIES.includes(category)) {
    throw new Error("Unsupported cleanup category");
  }

  const summary = (await getCleanupCenterSummary()).categories.find((c) => c.id === category);
  if (!summary?.canDelete) {
    throw new Error("Nothing to clean up for this category");
  }

  const databaseSizeBeforeBytes = await queryDatabaseSizeBytes();
  const uploadedFilesBeforeBytes = await measureUploadedFilesBytes();

  let deletedRecords = 0;
  let deletedFiles = 0;
  const details: Record<string, number> = {};
  const tablesToVacuum = new Set<string>();

  switch (category) {
    case "attendance_records": {
      const paths = await collectAttendanceImagePaths("TRUE");
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const del = await client.query(`DELETE FROM attendance`);
        deletedRecords = del.rowCount ?? 0;
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
      deletedFiles = await removeFiles(paths);
      // Remove any leftover orphaned upload files (selfies/site photos no longer referenced).
      deletedFiles += await purgeOrphanUploadsPreservingSystemFiles();
      tablesToVacuum.add("attendance");
      details.attendance_deleted = deletedRecords;
      details.image_files_removed = deletedFiles;
      break;
    }
    case "selfies": {
      const paths = await collectAttendanceImagePaths(SELFIE_WHERE);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const update = await client.query(
          `UPDATE attendance
              SET check_in_selfie_path = NULL,
                  site_photo_paths = '[]'::jsonb,
                  updated_at = now()
            WHERE ${SELFIE_WHERE}`
        );
        deletedRecords = update.rowCount ?? 0;
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
      deletedFiles = await removeFiles(paths);
      deletedFiles += await purgeOrphanUploadsPreservingSystemFiles();
      tablesToVacuum.add("attendance");
      details.attendance_rows_cleared = deletedRecords;
      details.image_files_removed = deletedFiles;
      break;
    }
    case "location_history": {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const update = await client.query(
          `UPDATE attendance
              SET check_in_latitude = NULL,
                  check_in_longitude = NULL,
                  check_in_address = NULL,
                  check_out_latitude = NULL,
                  check_out_longitude = NULL,
                  check_out_address = NULL,
                  check_out_gps_accuracy = NULL,
                  updated_at = now()
            WHERE ${LOCATION_WHERE}`
        );
        deletedRecords = update.rowCount ?? 0;
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
      tablesToVacuum.add("attendance");
      details.location_rows_cleared = deletedRecords;
      break;
    }
    case "audit_logs": {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const del = await client.query(`DELETE FROM audit_logs`);
        deletedRecords = del.rowCount ?? 0;
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
      tablesToVacuum.add("audit_logs");
      details.audit_logs_deleted = deletedRecords;
      break;
    }
    case "archived_expenses": {
      const result = await deleteArchivedExpenseData();
      const paths = [
        ...new Set(
          result.receiptPaths
            .map((p) => normalizeRelativePath(p))
            .filter((p): p is string => Boolean(p))
        ),
      ];
      deletedRecords = result.deletedRequests + result.deletedExpenses;
      deletedFiles = await removeFiles(paths);
      tablesToVacuum.add("expenses");
      tablesToVacuum.add("expense_reimbursement_requests");
      details.requests_deleted = result.deletedRequests;
      details.expenses_deleted = result.deletedExpenses;
      details.receipt_files_removed = deletedFiles;
      break;
    }
  }

  if (tablesToVacuum.size > 0) {
    await vacuumTables([...tablesToVacuum]);
  }

  const databaseSizeAfterBytes = await queryDatabaseSizeBytes();
  const uploadedFilesAfterBytes = await measureUploadedFilesBytes();

  return {
    category,
    deletedRecords,
    deletedFiles,
    databaseSizeBeforeBytes,
    databaseSizeAfterBytes,
    databaseSizeRecoveredBytes: Math.max(0, databaseSizeBeforeBytes - databaseSizeAfterBytes),
    uploadedFilesBeforeBytes,
    uploadedFilesAfterBytes,
    uploadedFilesRecoveredBytes: Math.max(0, uploadedFilesBeforeBytes - uploadedFilesAfterBytes),
    details,
  };
}

/** @deprecated Kept for older imports/tests */
export type CleanupTarget = CleanupCategory;
export const CLEANUP_TARGETS = CLEANUP_CATEGORIES;
export async function previewStorageCleanup(request: {
  category: CleanupCategory;
}): Promise<CleanupCategorySummary> {
  const summary = await getCleanupCenterSummary();
  const found = summary.categories.find((c) => c.id === request.category);
  if (!found) throw new Error("Unsupported cleanup category");
  return found;
}

export async function runDataCleanup(category: CleanupCategory): Promise<CleanupResult> {
  return executeStorageCleanup(category);
}
