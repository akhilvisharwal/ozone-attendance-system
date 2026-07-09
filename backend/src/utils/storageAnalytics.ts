import fs from "fs";
import path from "path";
import { pool } from "../config/db";
import { env } from "../config/env";
import { storage } from "../services/storage";
import { formatDatabaseSize } from "./backupHelpers";

export type StorageKind = "postgresql" | "files";

export interface TableStat {
  name: string;
  recordCount: number;
  sizeBytes: number;
}

export interface FileGroupStat {
  bytes: number;
  fileCount: number;
  missingFiles: number;
}

export interface StorageCategoryDraft {
  id: string;
  label: string;
  recordCount: number;
  sizeBytes: number;
  storageKind: StorageKind;
  description: string;
}

const UPLOAD_ROOT = path.join(process.cwd(), env.uploadDir);

/** Maps PostgreSQL table names to analytics category ids. */
const TABLE_CATEGORY: Record<string, string> = {
  attendance: "attendance",
  employees: "employees",
  sites: "sites",
  leave_requests: "leave",
  company_holidays: "holidays",
  audit_logs: "audit",
  app_settings: "settings",
  tasks: "tasks",
  task_attachments: "tasks",
  task_comments: "tasks",
  task_extension_requests: "tasks",
  task_reminder_log: "tasks",
  app_notifications: "tasks",
};

const CATEGORY_META: Record<
  string,
  { label: string; storageKind: StorageKind; description: string }
> = {
  attendance: {
    label: "Attendance",
    storageKind: "postgresql",
    description: "PostgreSQL storage for the attendance table (pg_total_relation_size).",
  },
  employees: {
    label: "Employees",
    storageKind: "postgresql",
    description: "PostgreSQL storage for the employees table (includes soft-deleted rows).",
  },
  sites: {
    label: "Sites",
    storageKind: "postgresql",
    description: "PostgreSQL storage for the sites table.",
  },
  leave: {
    label: "Leave",
    storageKind: "postgresql",
    description: "PostgreSQL storage for leave requests.",
  },
  holidays: {
    label: "Holidays",
    storageKind: "postgresql",
    description: "PostgreSQL storage for company holidays.",
  },
  audit: {
    label: "Audit Logs",
    storageKind: "postgresql",
    description: "PostgreSQL storage for audit logs.",
  },
  settings: {
    label: "Settings",
    storageKind: "postgresql",
    description: "PostgreSQL storage for application settings.",
  },
  tasks: {
    label: "Tasks",
    storageKind: "postgresql",
    description:
      "PostgreSQL storage for tasks, comments, extension requests, notifications, and attachment metadata.",
  },
  other_db: {
    label: "Other Database",
    storageKind: "postgresql",
    description:
      "Remaining PostgreSQL tables and internal database overhead (indexes, catalogs, free space).",
  },
  selfies: {
    label: "Selfies",
    storageKind: "files",
    description: "Check-in selfie image files referenced by attendance records.",
  },
  site_photos: {
    label: "Site Photos",
    storageKind: "files",
    description: "Site visit photo files referenced by attendance records.",
  },
  profile_photos: {
    label: "Profile Photos",
    storageKind: "files",
    description: "Employee profile photo files stored in uploads.",
  },
  site_images: {
    label: "Site Images",
    storageKind: "files",
    description: "Site cover images stored in uploads.",
  },
  task_documents: {
    label: "Task Documents",
    storageKind: "files",
    description: "Task attachment files stored in uploads.",
  },
  unreferenced_files: {
    label: "Unreferenced Files",
    storageKind: "files",
    description: "Files present in uploads that are not referenced by any database record.",
  },
};

export function percentOf(part: number, total: number): number {
  if (total <= 0 || part <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

export function normalizeRelativePath(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  return raw.trim().replace(/\\/g, "/").replace(/^\/+/, "");
}

export async function queryDatabaseSizeBytes(): Promise<number> {
  const res = await pool.query<{ bytes: string }>(
    `SELECT pg_database_size(current_database())::text AS bytes`
  );
  return parseInt(res.rows[0]?.bytes ?? "0", 10);
}

/** All user tables with live row counts and pg_total_relation_size. */
export async function queryAllTableStats(): Promise<TableStat[]> {
  const res = await pool.query<{ name: string; count: string; bytes: string }>(
    `SELECT
       c.relname AS name,
       COALESCE(s.n_live_tup, 0)::text AS count,
       COALESCE(pg_total_relation_size(c.oid), 0)::text AS bytes
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
    ORDER BY c.relname ASC`
  );
  return res.rows.map((row) => ({
    name: row.name,
    recordCount: parseInt(row.count ?? "0", 10),
    sizeBytes: parseInt(row.bytes ?? "0", 10),
  }));
}

async function sumReferencedFileSizes(paths: Iterable<string>): Promise<FileGroupStat> {
  const unique = new Set<string>();
  for (const p of paths) {
    const normalized = normalizeRelativePath(p);
    if (normalized) unique.add(normalized);
  }

  let bytes = 0;
  let fileCount = 0;
  let missingFiles = 0;
  await Promise.all(
    Array.from(unique).map(async (relativePath) => {
      const size = await storage.statSize(relativePath);
      if (size == null) {
        missingFiles += 1;
        return;
      }
      bytes += size;
      fileCount += 1;
    })
  );
  return { bytes, fileCount, missingFiles };
}

function parseSitePhotoPaths(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const paths: string[] = [];
  for (const item of raw) {
    if (typeof item === "string" && item.trim()) paths.push(item);
  }
  return paths;
}

export async function collectReferencedFilePaths(): Promise<{
  selfies: string[];
  sitePhotos: string[];
  profilePhotos: string[];
  siteImages: string[];
  taskDocuments: string[];
  allReferenced: Set<string>;
}> {
  const [attendanceRes, employeesRes, sitesRes, taskRes] = await Promise.all([
    pool.query<{ check_in_selfie_path: string | null; site_photo_paths: unknown }>(
      `SELECT check_in_selfie_path, site_photo_paths FROM attendance`
    ),
    pool.query<{ profile_photo_path: string | null }>(
      `SELECT profile_photo_path FROM employees WHERE profile_photo_path IS NOT NULL`
    ),
    pool.query<{ image_path: string | null }>(
      `SELECT image_path FROM sites WHERE image_path IS NOT NULL`
    ),
    pool.query<{ file_path: string }>(`SELECT file_path FROM task_attachments`),
  ]);

  const selfies: string[] = [];
  const sitePhotos: string[] = [];
  for (const row of attendanceRes.rows) {
    const selfie = normalizeRelativePath(row.check_in_selfie_path);
    if (selfie) selfies.push(selfie);
    sitePhotos.push(...parseSitePhotoPaths(row.site_photo_paths).map((p) => normalizeRelativePath(p)!).filter(Boolean));
  }

  const profilePhotos = employeesRes.rows
    .map((r) => normalizeRelativePath(r.profile_photo_path))
    .filter((p): p is string => Boolean(p));

  const siteImages = sitesRes.rows
    .map((r) => normalizeRelativePath(r.image_path))
    .filter((p): p is string => Boolean(p));

  const taskDocuments = taskRes.rows
    .map((r) => normalizeRelativePath(r.file_path))
    .filter((p): p is string => Boolean(p));

  const allReferenced = new Set<string>([
    ...selfies,
    ...sitePhotos,
    ...profilePhotos,
    ...siteImages,
    ...taskDocuments,
  ]);

  return { selfies, sitePhotos, profilePhotos, siteImages, taskDocuments, allReferenced };
}

async function walkUploadFiles(dir: string, files: string[] = []): Promise<string[]> {
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkUploadFiles(full, files);
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

export async function measureUploadDirectoryBytes(
  referenced: Set<string>
): Promise<{ totalBytes: number; unreferencedBytes: number; unreferencedCount: number }> {
  const diskFiles = await walkUploadFiles(UPLOAD_ROOT);
  let totalBytes = 0;
  let unreferencedBytes = 0;
  let unreferencedCount = 0;

  for (const fullPath of diskFiles) {
    if (!fullPath.startsWith(UPLOAD_ROOT)) continue;
    let size = 0;
    try {
      size = (await fs.promises.stat(fullPath)).size;
    } catch {
      continue;
    }
    totalBytes += size;
    const relative = normalizeRelativePath(
      path.relative(UPLOAD_ROOT, fullPath).split(path.sep).join("/")
    );
    if (!relative || referenced.has(relative)) continue;
    unreferencedBytes += size;
    unreferencedCount += 1;
  }

  return { totalBytes, unreferencedBytes, unreferencedCount };
}

export function buildPostgresCategories(tables: TableStat[], databaseSizeBytes: number): StorageCategoryDraft[] {
  const grouped = new Map<string, { sizeBytes: number; recordCount: number; tables: string[] }>();

  for (const table of tables) {
    const categoryId = TABLE_CATEGORY[table.name] ?? "other_db";
    const current = grouped.get(categoryId) ?? { sizeBytes: 0, recordCount: 0, tables: [] };
    current.sizeBytes += table.sizeBytes;
    current.recordCount += table.recordCount;
    current.tables.push(table.name);
    grouped.set(categoryId, current);
  }

  const tableBytesSum = tables.reduce((sum, t) => sum + t.sizeBytes, 0);
  const overhead = Math.max(0, databaseSizeBytes - tableBytesSum);
  if (overhead > 0) {
    const other = grouped.get("other_db") ?? { sizeBytes: 0, recordCount: 0, tables: [] };
    other.sizeBytes += overhead;
    grouped.set("other_db", other);
  }

  const order = [
    "attendance",
    "employees",
    "sites",
    "leave",
    "holidays",
    "audit",
    "settings",
    "tasks",
    "other_db",
  ];

  return order
    .filter((id) => (grouped.get(id)?.sizeBytes ?? 0) > 0 || id === "other_db")
    .map((id) => {
      const data = grouped.get(id) ?? { sizeBytes: 0, recordCount: 0, tables: [] };
      const meta = CATEGORY_META[id];
      return {
        id,
        label: meta.label,
        recordCount: data.recordCount,
        sizeBytes: data.sizeBytes,
        storageKind: meta.storageKind,
        description: meta.description,
      };
    })
    .filter((c) => c.sizeBytes > 0);
}

export async function buildFileCategories(
  referenced: Awaited<ReturnType<typeof collectReferencedFilePaths>>
): Promise<StorageCategoryDraft[]> {
  const [selfies, sitePhotos, profilePhotos, siteImages, taskDocuments, disk] =
    await Promise.all([
      sumReferencedFileSizes(referenced.selfies),
      sumReferencedFileSizes(referenced.sitePhotos),
      sumReferencedFileSizes(referenced.profilePhotos),
      sumReferencedFileSizes(referenced.siteImages),
      sumReferencedFileSizes(referenced.taskDocuments),
      measureUploadDirectoryBytes(referenced.allReferenced),
    ]);

  const drafts: Array<{ id: string; stat: FileGroupStat }> = [
    { id: "selfies", stat: selfies },
    { id: "site_photos", stat: sitePhotos },
    { id: "profile_photos", stat: profilePhotos },
    { id: "site_images", stat: siteImages },
    { id: "task_documents", stat: taskDocuments },
  ];

  if (disk.unreferencedCount > 0) {
    drafts.push({
      id: "unreferenced_files",
      stat: { bytes: disk.unreferencedBytes, fileCount: disk.unreferencedCount, missingFiles: 0 },
    });
  }

  return drafts
    .filter((d) => d.stat.bytes > 0 || d.stat.fileCount > 0)
    .map((d) => {
      const meta = CATEGORY_META[d.id];
      const missingNote =
        d.stat.missingFiles > 0
          ? ` ${d.stat.missingFiles} referenced file(s) missing on disk.`
          : "";
      return {
        id: d.id,
        label: meta.label,
        recordCount: d.stat.fileCount,
        sizeBytes: d.stat.bytes,
        storageKind: meta.storageKind,
        description: meta.description + missingNote,
      };
    });
}

export function finalizeCategories(
  drafts: StorageCategoryDraft[],
  totalStorageUsedBytes: number
): Array<
  StorageCategoryDraft & { sizeLabel: string; percentOfTotal: number }
> {
  return drafts.map((draft) => ({
    ...draft,
    sizeLabel: formatDatabaseSize(draft.sizeBytes),
    percentOfTotal: percentOf(draft.sizeBytes, totalStorageUsedBytes),
  }));
}

export function finalizeTables(
  tables: TableStat[],
  totalStorageUsedBytes: number
): Array<TableStat & { sizeLabel: string; percentOfTotal: number; storageKind: StorageKind }> {
  return tables.map((table) => ({
    ...table,
    sizeLabel: formatDatabaseSize(table.sizeBytes),
    percentOfTotal: percentOf(table.sizeBytes, totalStorageUsedBytes),
    storageKind: "postgresql" as const,
  }));
}
