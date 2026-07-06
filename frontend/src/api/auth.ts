import { apiClient } from "./client";
import type { Employee } from "@/types";

export async function login(employeeId: string, password: string) {
  const res = await apiClient.post<{ accessToken: string; employee: Employee }>("/auth/login", {
    employeeId,
    password,
  });
  return res.data;
}

export async function refresh() {
  const res = await apiClient.post<{ accessToken: string; employee: Employee }>("/auth/refresh");
  return res.data;
}

export async function logout() {
  await apiClient.post("/auth/logout");
}

export async function fetchMe() {
  const res = await apiClient.get<{ employee: Employee }>("/auth/me");
  return res.data.employee;
}
