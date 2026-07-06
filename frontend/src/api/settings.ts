import { apiClient } from "./client";
import type { AppSettings, AuditLogEntry, PublicSettings, SettingsCategory } from "@/types/settings";

export async function fetchSettings() {
  const res = await apiClient.get<{ settings: AppSettings }>("/settings");
  return res.data.settings;
}

export async function updateSettingsCategory<C extends SettingsCategory>(
  category: C,
  value: AppSettings[C]
) {
  const res = await apiClient.patch<{ settings: AppSettings; category: AppSettings[C] }>(
    `/settings/${category}`,
    value
  );
  return res.data.settings;
}

export async function uploadCompanyLogo(file: File) {
  const form = new FormData();
  form.append("logo", file);
  const res = await apiClient.post<{ settings: AppSettings; logoPath: string }>(
    "/settings/company/logo",
    form,
    { headers: { "Content-Type": "multipart/form-data" } }
  );
  return res.data;
}

export async function changeAdminPassword(currentPassword: string, newPassword: string) {
  await apiClient.post("/settings/security/change-password", { currentPassword, newPassword });
}

export async function fetchAuditLogs(params?: {
  page?: number;
  limit?: number;
  action?: string;
  from?: string;
  to?: string;
}) {
  const res = await apiClient.get<{ logs: AuditLogEntry[]; total: number; page: number; limit: number }>(
    "/settings/audit-logs",
    { params }
  );
  return res.data;
}

export async function exportAllData() {
  const res = await apiClient.get<{ exportedAt: string; data: Record<string, unknown> }>("/settings/export");
  return res.data;
}

export async function fetchPublicSettings(): Promise<PublicSettings> {
  const res = await apiClient.get<PublicSettings>("/settings/public");
  return res.data;
}
