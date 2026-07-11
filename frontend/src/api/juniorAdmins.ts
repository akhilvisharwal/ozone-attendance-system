import { apiClient } from "./client";
import type { Employee } from "@/types";
import type { AdminPermissions } from "@/auth/permissions";
import type { EmailOtpPayload } from "@/api/emailVerification";

export interface JuniorAdminCredentials {
  employeeId: string;
  temporaryPassword: string;
}

export async function listJuniorAdmins() {
  const res = await apiClient.get<{ items: Employee[] }>("/junior-admins");
  return res.data.items;
}

export async function getJuniorAdmin(id: string) {
  const res = await apiClient.get<{ employee: Employee }>(`/junior-admins/${id}`);
  return res.data.employee;
}

export async function createJuniorAdmin(payload: {
  name: string;
  employeeCode?: string;
  email?: string | null;
  phone?: string | null;
  password?: string;
  permissions?: AdminPermissions;
  isActive?: boolean;
  mustChangePassword?: boolean;
} & EmailOtpPayload) {
  const res = await apiClient.post<{ employee: Employee; credentials: JuniorAdminCredentials }>(
    "/junior-admins",
    payload
  );
  return res.data;
}

export async function updateJuniorAdmin(
  id: string,
  payload: {
    name?: string;
    email?: string | null;
    phone?: string | null;
    permissions?: AdminPermissions;
    isActive?: boolean;
    mustChangePassword?: boolean;
  }
) {
  const res = await apiClient.patch<{ employee: Employee }>(`/junior-admins/${id}`, payload);
  return res.data.employee;
}

export async function setJuniorAdminActive(id: string, isActive: boolean) {
  const res = await apiClient.patch<{ employee: Employee }>(`/junior-admins/${id}/status`, {
    isActive,
  });
  return res.data.employee;
}

export async function resetJuniorAdminPassword(
  id: string,
  payload?: { password?: string; mustChangePassword?: boolean }
) {
  const res = await apiClient.post<{ employee: Employee; credentials: JuniorAdminCredentials }>(
    `/junior-admins/${id}/reset-password`,
    payload ?? {}
  );
  return res.data;
}

export async function deleteJuniorAdmin(id: string, otp: EmailOtpPayload) {
  const res = await apiClient.delete<{ employee: Employee; message: string }>(
    `/junior-admins/${id}`,
    { data: otp }
  );
  return res.data;
}
