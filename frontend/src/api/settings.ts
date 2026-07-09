import { apiClient } from "./client";
import type {
  AppSettings,
  AuditLogEntry,
  AuditLogFilters,
  AuditLogsResponse,
  AuditRetentionDays,
  AuditSettings,
  BackupSettings,
  BackupStatusResponse,
  CleanupResultResponse,
  CleanupTarget,
  DatabasePanelResponse,
  PublicSettings,
  SettingsCategory,
  StorageBreakdown,
} from "@/types/settings";

function downloadBlob(blob: Blob, filename: string): void {
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(blobUrl);
}

function filenameFromDisposition(disposition: string | undefined, fallback: string): string {
  const match = disposition?.match(/filename="(.+)"/);
  return match?.[1] ?? fallback;
}

export async function fetchBackupStatus(): Promise<BackupStatusResponse> {
  const res = await apiClient.get<BackupStatusResponse>("/settings/backup/status");
  return res.data;
}

export async function fetchDatabasePanel(): Promise<DatabasePanelResponse> {
  const res = await apiClient.get<DatabasePanelResponse>("/settings/backup/storage");
  return res.data;
}

export async function fetchStorageBreakdown(): Promise<StorageBreakdown> {
  const res = await apiClient.get<DatabasePanelResponse>("/settings/backup/storage");
  return res.data.storage;
}

export async function runDataCleanup(
  target: CleanupTarget,
  confirmation: "DELETE"
): Promise<CleanupResultResponse> {
  const res = await apiClient.post<CleanupResultResponse>("/settings/backup/cleanup", {
    target,
    confirmation,
  });
  return res.data;
}

export async function runBackupNow(): Promise<void> {
  const res = await apiClient.post("/settings/backup/run", null, { responseType: "blob" });
  const disposition = res.headers["content-disposition"] as string | undefined;
  const filename = filenameFromDisposition(disposition, "ozone-backup-full.json");
  downloadBlob(res.data as Blob, filename);
}

export async function exportBackupData(type: "all" | "attendance" | "employees"): Promise<void> {
  const routeType = type === "all" ? "full" : type;
  const res = await apiClient.get(`/settings/backup/export/${routeType}`, { responseType: "blob" });
  const disposition = res.headers["content-disposition"] as string | undefined;
  const filename = filenameFromDisposition(disposition, `ozone-export-${routeType}.json`);
  downloadBlob(res.data as Blob, filename);
}

export async function exportReadableReport(
  format: "pdf" | "excel",
  scope: "full" | "attendance" | "employees" = "full"
): Promise<void> {
  const res = await apiClient.get(`/settings/backup/report/${format}`, {
    params: { scope },
    responseType: "blob",
  });
  const disposition = res.headers["content-disposition"] as string | undefined;
  const ext = format === "pdf" ? "pdf" : "xlsx";
  const fallback =
    scope === "full" ? `ozone-data-export-report.${ext}` : `ozone-${scope}-report.${ext}`;
  const filename = filenameFromDisposition(disposition, fallback);
  downloadBlob(res.data as Blob, filename);
}

export async function restoreFromBackup(file: File): Promise<{ restoredTables: string[] }> {
  const form = new FormData();
  form.append("backup", file);
  const res = await apiClient.post<{ success: boolean; restoredTables: string[] }>(
    "/settings/backup/restore",
    form,
    { headers: { "Content-Type": "multipart/form-data" } }
  );
  return { restoredTables: res.data.restoredTables };
}

export async function updateBackupSettings(value: BackupSettings): Promise<AppSettings> {
  return updateSettingsCategory("backup", value);
}

export async function updateDatabaseCapacityGb(capacityGb: number): Promise<AppSettings> {
  const current = await fetchSettings();
  return updateSettingsCategory("backup", {
    ...current.backup,
    databaseCapacityGb: capacityGb,
  });
}

export async function fetchPublicSettings(): Promise<PublicSettings> {
  const res = await apiClient.get<PublicSettings>("/settings/public");
  return res.data;
}

export async function fetchSettings(): Promise<AppSettings> {
  const res = await apiClient.get<{ settings: AppSettings }>("/settings");
  return res.data.settings;
}

export interface EmployeeIdPrefixMigrationResult {
  from: string;
  to: string;
  renamedCount: number;
  remappedDueToConflictCount?: number;
}

export async function updateSettingsCategory<C extends SettingsCategory>(
  category: C,
  value: AppSettings[C]
): Promise<AppSettings> {
  const res = await apiClient.patch<{ settings: AppSettings; category: AppSettings[C] }>(
    `/settings/${category}`,
    value
  );
  return res.data.settings;
}

export async function updateEmployeeSettings(value: AppSettings["employee"]): Promise<{
  settings: AppSettings;
  employeeIdPrefixMigration?: EmployeeIdPrefixMigrationResult;
}> {
  const res = await apiClient.patch<{
    settings: AppSettings;
    category: AppSettings["employee"];
    employeeIdPrefixMigration?: EmployeeIdPrefixMigrationResult;
  }>("/settings/employee", value);
  return {
    settings: res.data.settings,
    employeeIdPrefixMigration: res.data.employeeIdPrefixMigration,
  };
}

export async function changeAdminPassword(input: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<void> {
  await apiClient.post("/settings/security/change-password", input);
}

function cleanAuditParams(filters: AuditLogFilters = {}): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  if (filters.page) params.page = filters.page;
  if (filters.limit) params.limit = filters.limit;
  if (filters.search?.trim()) params.search = filters.search.trim();
  if (filters.from) params.from = filters.from;
  if (filters.to) params.to = filters.to;
  if (filters.actorId) params.actorId = filters.actorId;
  if (filters.module) params.module = filters.module;
  if (filters.actionType) params.actionType = filters.actionType;
  if (filters.status) params.status = filters.status;
  if (filters.action?.trim()) params.action = filters.action.trim();
  return params;
}

export async function fetchAuditLogs(filters: AuditLogFilters = {}): Promise<AuditLogsResponse> {
  const res = await apiClient.get<AuditLogsResponse>("/settings/audit-logs", {
    params: cleanAuditParams(filters),
  });
  return res.data;
}

export async function fetchAuditLogById(id: string): Promise<AuditLogEntry> {
  const res = await apiClient.get<{ log: AuditLogEntry }>(`/settings/audit-logs/${id}`);
  return res.data.log;
}

export async function clearAuditLogs(confirmation: "DELETE"): Promise<{ deletedRecords: number }> {
  const res = await apiClient.post<{ success: boolean; deletedRecords: number }>(
    "/settings/audit-logs/clear",
    { confirmation }
  );
  return { deletedRecords: res.data.deletedRecords };
}

export async function exportAuditLogs(
  format: "pdf" | "excel",
  filters: Omit<AuditLogFilters, "page" | "limit"> = {}
): Promise<void> {
  const res = await apiClient.get(`/settings/audit-logs/export/${format}`, {
    params: cleanAuditParams(filters),
    responseType: "blob",
  });
  const disposition = res.headers["content-disposition"] as string | undefined;
  const ext = format === "pdf" ? "pdf" : "xlsx";
  const filename = filenameFromDisposition(disposition, `ozone-audit-logs.${ext}`);
  downloadBlob(res.data as Blob, filename);
}

export async function updateAuditSettings(value: AuditSettings): Promise<AppSettings> {
  return updateSettingsCategory("audit", value);
}

export async function updateAuditRetentionDays(
  retentionDays: AuditRetentionDays
): Promise<AppSettings> {
  return updateAuditSettings({ retentionDays });
}
