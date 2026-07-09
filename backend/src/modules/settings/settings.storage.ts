import fs from "fs";
import path from "path";
import { pool } from "../../config/db";
import { env } from "../../config/env";
import { storage } from "../../services/storage";
import { formatDatabaseSize } from "../../utils/backupHelpers";
import { buildStorageCapacity, type StorageCapacity } from "../../utils/storageCapacity";
import { resolveDatabaseCapacity } from "../../utils/providerCapacity";

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

export interface StorageCategory {
  id: string;
  label: string;
  recordCount: number;
  /** Null when size cannot be determined accurately. */
  sizeBytes: number | null;
  sizeLabel: string;
  percentOfTotal: number | null;
  description: string;
}

export interface StorageBreakdown {
  databaseSizeBytes: number;
  databaseSizeLabel: string;
  totalTrackedBytes: number;
  totalTrackedLabel: string;
  capacity: StorageCapacity;
  categories: StorageCategory[];
  tables: Array<{
    name: string;
    recordCount: number;
    sizeBytes: number;
    sizeLabel: string;
    percentOfTotal: number;
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

const UPLOAD_ROOT = path.join(process.cwd(), env.uploadDir);

async function tableStats(table: string): Promise<{ count: number; sizeBytes: number }> {
  const [countRes, sizeRes] = await Promise.all([
    pool.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM ${table}`),
    pool.query<{ bytes: string }>(
      `SELECT COALESCE(pg_total_relation_size($1::regclass), 0)::text AS bytes`,
      [table]
    ),
  ]);
  return {
    count: parseInt(countRes.rows[0]?.count ?? "0", 10),
    sizeBytes: parseInt(sizeRes.rows[0]?.bytes ?? "0", 10),
  };
}

/** Exact on-disk toast/column storage for selected columns (PostgreSQL only). */
async function columnStorageBytes(table: string, columns: string[]): Promise<number> {
  if (!columns.length) return 0;
  const expressions = columns
    .map((col) => `COALESCE(pg_column_size(t."${col}"), 0)`)
    .join(" + ");
  const res = await pool.query<{ bytes: string }>(
    `SELECT COALESCE(SUM(${expressions}), 0)::text AS bytes FROM ${table} t`
  );
  return parseInt(res.rows[0]?.bytes ?? "0", 10);
}

function fileSizeSafe(relativePath: string | null | undefined): number {
  if (!relativePath) return 0;
  const fullPath = path.join(UPLOAD_ROOT, relativePath);
  if (!fullPath.startsWith(UPLOAD_ROOT)) return 0;
  try {
    return fs.statSync(fullPath).size;
  } catch {
    return 0;
  }
}

async function collectSelfiePaths(): Promise<string[]> {
  const res = await pool.query<{
    check_in_selfie_path: string | null;
    site_photo_paths: unknown;
  }>(`SELECT check_in_selfie_path, site_photo_paths FROM attendance`);

  const paths = new Set<string>();
  for (const row of res.rows) {
    if (row.check_in_selfie_path) paths.add(row.check_in_selfie_path);
    const photos = row.site_photo_paths;
    if (Array.isArray(photos)) {
      for (const p of photos) {
        if (typeof p === "string" && p.trim()) paths.add(p);
      }
    }
  }
  return Array.from(paths);
}

async function selfieStorageBytes(): Promise<{ bytes: number; fileCount: number }> {
  const paths = await collectSelfiePaths();
  let bytes = 0;
  for (const p of paths) bytes += fileSizeSafe(p);
  return { bytes, fileCount: paths.length };
}

async function locationRecordCount(): Promise<number> {
  const res = await pool.query<{ count: string }>(
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
  return parseInt(res.rows[0]?.count ?? "0", 10);
}

const LOCATION_COLUMNS = [
  "check_in_latitude",
  "check_in_longitude",
  "check_in_address",
  "check_out_latitude",
  "check_out_longitude",
  "check_out_address",
  "check_out_gps_accuracy",
] as const;

function withPercents(
  items: Array<{ sizeBytes: number | null } & Record<string, unknown>>,
  totalBytes: number
): Array<{ sizeLabel: string; percentOfTotal: number | null } & (typeof items)[number]> {
  return items.map((item) => ({
    ...item,
    sizeLabel: item.sizeBytes == null ? "Unavailable" : formatDatabaseSize(item.sizeBytes),
    percentOfTotal:
      item.sizeBytes == null || totalBytes <= 0
        ? null
        : Math.round((item.sizeBytes / totalBytes) * 1000) / 10,
  }));
}

export async function getStorageBreakdown(): Promise<StorageBreakdown> {
  const dbSizeRes = await pool.query<{ bytes: string }>(
    `SELECT pg_database_size(current_database())::text AS bytes`
  );
  const databaseSizeBytes = parseInt(dbSizeRes.rows[0]?.bytes ?? "0", 10);

  const [
    attendance,
    employees,
    sites,
    leave,
    holidays,
    audit,
    settings,
    selfieStats,
    locationCount,
    locationBytes,
    selfiePathBytes,
  ] = await Promise.all([
    tableStats("attendance"),
    pool.query<{ count: string; bytes: string }>(
      `SELECT
         (SELECT COUNT(*)::text FROM employees WHERE deleted_at IS NULL) AS count,
         COALESCE(pg_total_relation_size('employees'::regclass), 0)::text AS bytes`
    ),
    pool.query<{ count: string; bytes: string }>(
      `SELECT
         (SELECT COUNT(*)::text FROM sites WHERE deleted_at IS NULL) AS count,
         COALESCE(pg_total_relation_size('sites'::regclass), 0)::text AS bytes`
    ),
    tableStats("leave_requests"),
    tableStats("company_holidays"),
    tableStats("audit_logs"),
    tableStats("app_settings"),
    selfieStorageBytes(),
    locationRecordCount(),
    columnStorageBytes("attendance", [...LOCATION_COLUMNS]),
    columnStorageBytes("attendance", ["check_in_selfie_path", "site_photo_paths"]),
  ]);

  const employeeCount = parseInt(employees.rows[0]?.count ?? "0", 10);
  const employeeBytes = parseInt(employees.rows[0]?.bytes ?? "0", 10);
  const siteCount = parseInt(sites.rows[0]?.count ?? "0", 10);
  const siteBytes = parseInt(sites.rows[0]?.bytes ?? "0", 10);

  // Attendance module size = full attendance table minus exact location + path column storage.
  const attendanceCoreBytes = Math.max(
    0,
    attendance.sizeBytes - locationBytes - selfiePathBytes
  );

  const categoriesRaw = [
    {
      id: "attendance",
      label: "Attendance",
      recordCount: attendance.count,
      sizeBytes: attendanceCoreBytes as number | null,
      description: "PostgreSQL storage for attendance rows (excluding location and selfie path columns).",
    },
    {
      id: "selfies",
      label: "Selfies",
      recordCount: selfieStats.fileCount,
      sizeBytes: selfieStats.bytes as number | null,
      description:
        "Uploaded selfie and site image files referenced by attendance records (file storage, not inside PostgreSQL).",
    },
    {
      id: "location",
      label: "Location History",
      recordCount: locationCount,
      sizeBytes: locationBytes as number | null,
      description: "Exact PostgreSQL storage for GPS and address columns on attendance records.",
    },
    {
      id: "employees",
      label: "Employees",
      recordCount: employeeCount,
      sizeBytes: employeeBytes as number | null,
      description: "PostgreSQL storage for the employees table (active and soft-deleted rows share table size).",
    },
    {
      id: "sites",
      label: "Sites",
      recordCount: siteCount,
      sizeBytes: siteBytes as number | null,
      description: "PostgreSQL storage for the sites table.",
    },
    {
      id: "leave",
      label: "Leave",
      recordCount: leave.count,
      sizeBytes: leave.sizeBytes as number | null,
      description: "PostgreSQL storage for leave requests.",
    },
    {
      id: "holidays",
      label: "Holidays",
      recordCount: holidays.count,
      sizeBytes: holidays.sizeBytes as number | null,
      description: "PostgreSQL storage for company holidays.",
    },
    {
      id: "audit",
      label: "Audit Logs",
      recordCount: audit.count,
      sizeBytes: audit.sizeBytes as number | null,
      description: "PostgreSQL storage for audit logs.",
    },
    {
      id: "settings",
      label: "Settings",
      recordCount: settings.count,
      sizeBytes: settings.sizeBytes as number | null,
      description: "PostgreSQL storage for application settings.",
    },
  ];

  // Breakdown percentages are relative to PostgreSQL database size (real DB capacity usage).
  // Selfie files are shown separately and do not inflate DB percent.
  const categories = withPercents(categoriesRaw, databaseSizeBytes).map((c) => ({
    id: String(c.id),
    label: String(c.label),
    recordCount: Number(c.recordCount),
    sizeBytes: c.sizeBytes,
    sizeLabel: c.sizeLabel,
    percentOfTotal: c.percentOfTotal,
    description: String(c.description),
  }));

  const trackedDbBytes = categories
    .filter((c) => c.id !== "selfies" && c.sizeBytes != null)
    .reduce((sum, c) => sum + (c.sizeBytes ?? 0), 0);

  const resolvedCapacity = await resolveDatabaseCapacity();
  const capacity = buildStorageCapacity({
    usedBytes: databaseSizeBytes,
    resolved: resolvedCapacity,
  });

  const tableNames = [
    "attendance",
    "employees",
    "sites",
    "leave_requests",
    "company_holidays",
    "audit_logs",
    "app_settings",
  ] as const;

  const tablesRaw = await Promise.all(
    tableNames.map(async (name) => {
      const stats = await tableStats(name);
      return { name, recordCount: stats.count, sizeBytes: stats.sizeBytes };
    })
  );
  const tables = tablesRaw.map((row) => ({
    ...row,
    sizeLabel: formatDatabaseSize(row.sizeBytes),
    percentOfTotal:
      databaseSizeBytes > 0
        ? Math.round((row.sizeBytes / databaseSizeBytes) * 1000) / 10
        : 0,
  }));

  const selfieCountRes = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
       FROM attendance
      WHERE check_in_selfie_path IS NOT NULL
         OR (site_photo_paths IS NOT NULL AND site_photo_paths <> '[]'::jsonb)`
  );
  const selfieRows = parseInt(selfieCountRes.rows[0]?.count ?? "0", 10);

  return {
    databaseSizeBytes,
    databaseSizeLabel: formatDatabaseSize(databaseSizeBytes),
    totalTrackedBytes: trackedDbBytes,
    totalTrackedLabel: formatDatabaseSize(trackedDbBytes),
    capacity,
    categories,
    tables,
    cleanupPreview: {
      attendance_records: {
        label: "Attendance records only",
        description:
          "Permanently deletes all attendance rows. Selfie files referenced by those rows are also removed from file storage.",
        affectedRecords: attendance.count,
        details: [
          `${attendance.count} attendance record(s)`,
          `${selfieStats.fileCount} selfie/site image file(s) will be removed with the records`,
        ],
      },
      attendance_selfies: {
        label: "Attendance selfie images only",
        description:
          "Clears selfie and site photo paths from attendance records and deletes the image files. Attendance rows and location data remain.",
        affectedRecords: selfieRows,
        details: [
          `${selfieRows} attendance record(s) with images`,
          `${selfieStats.fileCount} image file(s) in file storage`,
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
        affectedRecords: attendance.count,
        details: [
          `${attendance.count} attendance record(s)`,
          `${locationCount} location-bearing record(s)`,
          `${selfieStats.fileCount} image file(s)`,
        ],
      },
      audit_logs: {
        label: "Audit logs only",
        description:
          "Permanently deletes administrative audit log entries. Application data is not affected.",
        affectedRecords: audit.count,
        details: [`${audit.count} audit log entr${audit.count === 1 ? "y" : "ies"}`],
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
