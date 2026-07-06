import { apiClient } from "./client";
import type { AdminAttendanceRow, DashboardSummary } from "@/types";

export async function getDashboardSummary() {
  const res = await apiClient.get<{ summary: DashboardSummary; date: string }>("/dashboard/summary");
  return res.data;
}

export async function getTodayAttendance() {
  const res = await apiClient.get<{ items: AdminAttendanceRow[]; date: string }>("/dashboard/today");
  return res.data.items;
}
