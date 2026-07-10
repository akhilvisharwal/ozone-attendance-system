import { apiClient } from "./client";
import type { Employee } from "@/types";

export interface SessionInfo {
  timeoutMinutes: number;
  lastActivityAt: string;
}

export interface AuthSessionResponse {
  accessToken: string;
  employee: Employee;
  session?: SessionInfo;
}

export async function login(employeeId: string, password: string) {
  const res = await apiClient.post<AuthSessionResponse>("/auth/login", {
    employeeId,
    password,
  });
  return res.data;
}

export async function refresh() {
  const res = await apiClient.post<AuthSessionResponse>("/auth/refresh");
  return res.data;
}

export async function heartbeat() {
  const res = await apiClient.post<{ lastActivityAt: string; timeoutMinutes: number }>("/auth/heartbeat");
  return res.data;
}

export async function logout() {
  await apiClient.post("/auth/logout");
}

export async function fetchMe() {
  const res = await apiClient.get<{ employee: Employee }>("/auth/me");
  return res.data.employee;
}

export async function changePassword(currentPassword: string, newPassword: string) {
  const res = await apiClient.post<AuthSessionResponse & { message: string }>("/auth/change-password", {
    currentPassword,
    newPassword,
  });
  return res.data;
}
