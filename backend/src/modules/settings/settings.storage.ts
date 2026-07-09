import { pool } from "../../config/db";
import { storage } from "../../services/storage";
import { formatDatabaseSize } from "../../utils/backupHelpers";
import { buildStorageCapacity } from "../../utils/storageCapacity";
import { resolveDatabaseCapacity } from "../../utils/providerCapacity";
import {
  buildFileCategories,
  buildPostgresCategories,
  collectReferencedFilePaths,
  finalizeCategories,
  finalizeTables,
  measureUploadDirectoryBytes,
  normalizeRelativePath,
  queryAllTableStats,
  queryDatabaseSizeBytes,
} from "../../utils/storageAnalytics";

export type CleanupTarget =
  | "attendance_records"
  | "attendance_selfies"
  | "attendance_location"
  | "attendance_bundle"
  | "audit_logs";

export const CLEANUP_TARGETS: CleanupTarget[] = [
  "attendance_records",
  "attendance_selfies",
  "attendance_location",
  "attendance_bundle",
  "audit_logs",
];

export type StorageKind = "postgresql" | "files";

export interface StorageCategory {
  id: string;
  label: string;
  recordCount: number;
  sizeBytes: number;
  sizeLabel: string;
  percentOfTotal: number;
  storageKind: StorageKind;
  description: string;
}

export interface StorageBreakdown {
  databaseSizeBytes: number;
  databaseSizeLabel: string;
  uploadedFilesBytes: number;
  uploadedFilesLabel: string;
  totalStorageUsedBytes: number;
  totalStorageUsedLabel: string;
  totalTrackedBytes: number;
  totalTrackedLabel: string;
  capacity: import("../../utils/storageCapacity").StorageCapacity;
  categories: StorageCategory[];
  tables: Array<{
    name: string;
    recordCount: number;
    sizeBytes: number;
    sizeLabel: string;
    percentOfTotal: number;
    storageKind: StorageKind;
  }>;
  cleanupPreview: Record<
    CleanupTarget,
    {
      label: string;
      description: string;
      affectedRecords: number;
      details: string[];
    }
  >;
}

async function tableCount(table: string): Promise<number> {
  const res = await pool.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM ${table}`);
  return parseInt(res.rows[0]?.count ?? "0", 10);
}

async function collectSelfiePaths(): Promise<string[]> {
  const referenced = await collectReferencedFilePaths();
  return [...referenced.selfies, ...referenced.sitePhotos];
}

export async function getStorageBreakdown(): Promise<StorageBreakdown> {
  const [databaseSizeBytes, tables, referenced] = await Promise.all([
    queryDatabaseSizeBytes(),
    queryAllTableStats(),
    collectReferencedFilePaths(),
  ]);

  const [fileCategories, disk] = await Promise.all([
    buildFileCategories(referenced),
    measureUploadDirectoryBytes(referenced.allReferenced),
  ]);

  const postgresCategories = buildPostgresCategories(tables, databaseSizeBytes);
  const uploadedFilesBytes = disk.totalBytes;
  const totalStorageUsedBytes = databaseSizeBytes + uploadedFilesBytes;

  const categoryDrafts = [...postgresCategories, ...fileCategories];
  const categories = finalizeCategories(categoryDrafts, totalStorageUsedBytes);
  const tableRows = finalizeTables(tables, totalStorageUsedBytes);

  const totalTrackedBytes = categories.reduce((sum, c) => sum + c.sizeBytes, 0);

  const resolvedCapacity = await resolveDatabaseCapacity();
  const capacity = buildStorageCapacity({
    usedBytes: databaseSizeBytes,
    resolved: resolvedCapacity,
  });

  const [
    attendanceCount,
    locationCount,
    selfieRowCount,
    auditCount,
  ] = await Promise.all([
    tableCount("attendance"),
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM attendance
        WHERE check_in_latitude IS NOT NULL
           OR check_in_longitude IS NOT NULL
           OR check_in_address IS NOT NULL
           OR check_out_latitude IS NOT NULL
           OR check_out_longitude IS NOT NULL
           OR check_out_address IS NOT NULL
           OR check_out_gps_accuracy IS NOT NULL`
    ).then((r) => parseInt(r.rows[0]?.count ?? "0", 10)),
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM attendance
        WHERE check_in_selfie_path IS NOT NULL
           OR (site_photo_paths IS NOT NULL AND site_photo_paths <> '[]'::jsonb)`
    ).then((r) => parseInt(r.rows[0]?.count ?? "0", 10)),
    tableCount("audit_logs"),
  ]);

  const imageFileCount = new Set(
    [...referenced.selfies, ...referenced.sitePhotos].map((p) => normalizeRelativePath(p))
  ).size;

  return {
    databaseSizeBytes,
    databaseSizeLabel: formatDatabaseSize(databaseSizeBytes),
    uploadedFilesBytes,
    uploadedFilesLabel: formatDatabaseSize(uploadedFilesBytes),
    totalStorageUsedBytes,
    totalStorageUsedLabel: formatDatabaseSize(totalStorageUsedBytes),
    totalTrackedBytes,
    totalTrackedLabel: formatDatabaseSize(totalTrackedBytes),
    capacity,
    categories,
    tables: tableRows,
    cleanupPreview: {
      attendance_records: {
        label: "Attendance records only",
        description:
          "Permanently deletes all attendance rows. Selfie files referenced by those rows are also removed from file storage.",
        affectedRecords: attendanceCount,
        details: [
          `${attendanceCount} attendance record(s)`,
          `${imageFileCount} selfie/site image file(s) will be removed with the records`,
        ],
      },
      attendance_selfies: {
        label: "Attendance selfie images only",
        description:
          "Clears selfie and site photo paths from attendance records and deletes the image files. Attendance rows and location data remain.",
        affectedRecords: selfieRowCount,
        details: [
          `${selfieRowCount} attendance record(s) with images`,
          `${imageFileCount} image file(s) in file storage`,
        ],
      },
      attendance_location: {
        label: "Attendance location history only",
        description:
          "Clears GPS coordinates and address fields from attendance records. Attendance rows and selfie images remain.",
        affectedRecords: locationCount,
        details: [`${locationCount} attendance record(s) with location data`],
      },
      attendance_bundle: {
        label: "Attendance + selfie + location",
        description:
          "Deletes all attendance records together with their selfie images and location history.",
        affectedRecords: attendanceCount,
        details: [
          `${attendanceCount} attendance record(s)`,
          `${locationCount} location-bearing record(s)`,
          `${imageFileCount} image file(s)`,
        ],
      },
      audit_logs: {
        label: "Audit logs only",
        description:
          "Permanently deletes administrative audit log entries. Application data is not affected.",
        affectedRecords: auditCount,
        details: [`${auditCount} audit log entr${auditCount === 1 ? "y" : "ies"}`],
      },
    },
  };
}

async function removeSelfieFiles(paths: string[]): Promise<number> {
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

export async function runDataCleanup(target: CleanupTarget): Promise<{
  target: CleanupTarget;
  deletedRecords: number;
  deletedFiles: number;
  details: Record<string, number>;
}> {
  if (!CLEANUP_TARGETS.includes(target)) {
    throw new Error("Unsupported cleanup target");
  }

  if (target === "audit_logs") {
    const res = await pool.query(`DELETE FROM audit_logs`);
    return {
      target,
      deletedRecords: res.rowCount ?? 0,
      deletedFiles: 0,
      details: { audit_logs: res.rowCount ?? 0 },
    };
  }

  if (target === "attendance_selfies") {
    const paths = await collectSelfiePaths();
    const update = await pool.query(
      `UPDATE attendance
          SET check_in_selfie_path = NULL,
              site_photo_paths = '[]'::jsonb,
              updated_at = now()
        WHERE check_in_selfie_path IS NOT NULL
           OR (site_photo_paths IS NOT NULL AND site_photo_paths <> '[]'::jsonb)`
    );
    const deletedFiles = await removeSelfieFiles(paths);
    return {
      target,
      deletedRecords: update.rowCount ?? 0,
      deletedFiles,
      details: {
        attendance_rows_cleared: update.rowCount ?? 0,
        image_files_removed: deletedFiles,
      },
    };
  }

  if (target === "attendance_location") {
    const update = await pool.query(
      `UPDATE attendance
          SET check_in_latitude = NULL,
              check_in_longitude = NULL,
              check_in_address = NULL,
              check_out_latitude = NULL,
              check_out_longitude = NULL,
              check_out_address = NULL,
              check_out_gps_accuracy = NULL,
              updated_at = now()
        WHERE check_in_latitude IS NOT NULL
           OR check_in_longitude IS NOT NULL
           OR check_in_address IS NOT NULL
           OR check_out_latitude IS NOT NULL
           OR check_out_longitude IS NOT NULL
           OR check_out_address IS NOT NULL
           OR check_out_gps_accuracy IS NOT NULL`
    );
    return {
      target,
      deletedRecords: update.rowCount ?? 0,
      deletedFiles: 0,
      details: { location_rows_cleared: update.rowCount ?? 0 },
    };
  }

  const paths = await collectSelfiePaths();
  const del = await pool.query(`DELETE FROM attendance`);
  const deletedFiles = await removeSelfieFiles(paths);
  return {
    target,
    deletedRecords: del.rowCount ?? 0,
    deletedFiles,
    details: {
      attendance_deleted: del.rowCount ?? 0,
      image_files_removed: deletedFiles,
    },
  };
}
