import type { BackupSettings } from "../modules/settings/settings.types";

export type BackupExportType = "full" | "attendance" | "employees";

export interface BackupManifest {
  version: 1;
  type: BackupExportType;
  exportedAt: string;
  tableCounts: Record<string, number>;
}

export interface BackupPayload {
  manifest: BackupManifest;
  tables: Record<string, unknown[]>;
}

/** Tables included in a full backup, in FK-safe insert order. */
export const FULL_BACKUP_TABLES = [
  "employee_designations",
  "employees",
  "sites",
  "company_holidays",
  "leave_requests",
  "tasks",
  "task_attachments",
  "task_comments",
  "task_extension_requests",
  "attendance",
  "attendance_daily_overrides",
  "attendance_daily_override_employees",
  "app_notifications",
  "task_reminder_log",
  "expense_reimbursement_requests",
  "expenses",
  "expense_week_payments",
  "app_settings",
  "audit_logs",
] as const;

/** Tables cleared before restore (includes refresh_tokens so sessions reset). */
export const RESTORE_TRUNCATE_TABLES = [
  "task_reminder_log",
  "app_notifications",
  "expense_week_payments",
  "expense_reimbursement_requests",
  "expenses",
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
  "audit_logs",
  "app_settings",
  "refresh_tokens",
  "employees",
  "employee_designations",
] as const;

export function normalizeBackupSettings(raw: Partial<BackupSettings> | undefined): BackupSettings {
  return {
    automaticDailyBackup: raw?.automaticDailyBackup ?? false,
    lastBackupAt: typeof raw?.lastBackupAt === "string" ? raw.lastBackupAt : null,
  };
}

export function buildBackupPayload(
  type: BackupExportType,
  tables: Record<string, unknown[]>
): BackupPayload {
  const tableCounts: Record<string, number> = {};
  for (const [name, rows] of Object.entries(tables)) {
    tableCounts[name] = rows.length;
  }
  return {
    manifest: {
      version: 1,
      type,
      exportedAt: new Date().toISOString(),
      tableCounts,
    },
    tables,
  };
}

export function parseBackupPayload(raw: unknown): BackupPayload {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Invalid backup file format");
  }
  const obj = raw as Record<string, unknown>;
  const manifest = obj.manifest;
  const tables = obj.tables;
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("Backup file is missing manifest metadata");
  }
  if (!tables || typeof tables !== "object" || Array.isArray(tables)) {
    throw new Error("Backup file is missing table data");
  }
  const m = manifest as Record<string, unknown>;
  if (m.version !== 1) {
    throw new Error("Unsupported backup version");
  }
  if (m.type !== "full") {
    throw new Error("Only full backups can be restored");
  }
  const parsedTables: Record<string, unknown[]> = {};
  for (const [key, value] of Object.entries(tables as Record<string, unknown>)) {
    if (!Array.isArray(value)) {
      throw new Error(`Invalid table data for ${key}`);
    }
    parsedTables[key] = value;
  }
  if (!parsedTables.employees?.length) {
    throw new Error("Backup must include at least one employee record");
  }
  return {
    manifest: {
      version: 1,
      type: "full",
      exportedAt: typeof m.exportedAt === "string" ? m.exportedAt : new Date().toISOString(),
      tableCounts:
        m.tableCounts && typeof m.tableCounts === "object" && !Array.isArray(m.tableCounts)
          ? (m.tableCounts as Record<string, number>)
          : {},
    },
    tables: parsedTables,
  };
}

export function formatDatabaseSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
