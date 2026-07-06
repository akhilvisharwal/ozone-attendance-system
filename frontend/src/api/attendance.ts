import { apiClient } from "./client";
import type {
  AttendanceRecord,
  AdminAttendanceRow,
  MonthlyGrid,
  PaginatedResponse,
  TimingRules,
  WorkStatus,
} from "../types";

export interface CheckInInput {
  selfie?: Blob | null;
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number;
  siteId: string;
  workSummary?: string;
  workStatus?: WorkStatus;
  deviceInfo?: string;
}

export interface CheckOutInput {
  workSummary: string;
  workStatus: WorkStatus;
  remarks?: string;
  sitePhotos?: File[];
  latitude?: number;
  longitude?: number;
  accuracy?: number;
}

export interface MyHistoryParams {
  page?: number;
  limit?: number;
  from?: string;
  to?: string;
}

export interface AdminListParams {
  page?: number;
  limit?: number;
  employeeId?: string;
  from?: string;
  to?: string;
  status?: string;
}

export async function getTimingRules(): Promise<TimingRules> {
  const { data } = await apiClient.get<{ rules: TimingRules }>("/attendance/timing-rules");
  return data.rules;
}

export async function checkIn(
  input: CheckInInput | FormData
): Promise<{ record: AttendanceRecord; checkInStatus: string; isHalfDay: boolean }> {
  let fd: FormData;
  if (input instanceof FormData) {
    fd = input;
  } else {
    fd = new FormData();
    if (input.selfie) fd.append("selfie", input.selfie, "selfie.jpg");
    if (input.latitude  !== null && input.latitude  !== undefined) fd.append("latitude",  String(input.latitude));
    if (input.longitude !== null && input.longitude !== undefined) fd.append("longitude", String(input.longitude));
    if (input.accuracy !== undefined) fd.append("accuracy", String(input.accuracy));
    fd.append("siteId", input.siteId);
    if (input.workSummary) fd.append("workSummary", input.workSummary);
    if (input.workStatus)  fd.append("workStatus", input.workStatus);
    if (input.deviceInfo) fd.append("deviceInfo", input.deviceInfo);
  }
  const { data } = await apiClient.post<{ attendance: AttendanceRecord; checkInStatus: string; isHalfDay: boolean }>(
    "/attendance/check-in",
    fd,
    { headers: { "Content-Type": "multipart/form-data" } }
  );
  return { record: data.attendance, checkInStatus: data.checkInStatus, isHalfDay: data.isHalfDay };
}

export async function checkOut(input: CheckOutInput): Promise<AttendanceRecord> {
  const fd = new FormData();
  fd.append("workSummary", input.workSummary);
  fd.append("workStatus",  input.workStatus);
  if (input.remarks)   fd.append("remarks",   input.remarks);
  if (input.latitude  !== undefined) fd.append("latitude",  String(input.latitude));
  if (input.longitude !== undefined) fd.append("longitude", String(input.longitude));
  if (input.accuracy !== undefined) fd.append("accuracy", String(input.accuracy));
  for (const photo of input.sitePhotos ?? []) {
    fd.append("sitePhotos", photo);
  }
  const { data } = await apiClient.post<{ attendance: AttendanceRecord }>(
    "/attendance/check-out",
    fd,
    { headers: { "Content-Type": "multipart/form-data" } }
  );
  return data.attendance;
}

export async function getMyToday(): Promise<AttendanceRecord | null> {
  const { data } = await apiClient.get<{ attendance: AttendanceRecord | null }>("/attendance/me/today");
  return data.attendance;
}

export async function getMyHistory(params?: MyHistoryParams): Promise<PaginatedResponse<AttendanceRecord>> {
  const { data } = await apiClient.get<PaginatedResponse<AttendanceRecord>>("/attendance/me/history", { params });
  return data;
}

export async function getMyAttendanceById(id: string): Promise<AttendanceRecord> {
  const { data } = await apiClient.get<{ attendance: AttendanceRecord }>(`/attendance/me/${id}`);
  return data.attendance;
}

export async function adminListAttendance(params?: AdminListParams): Promise<PaginatedResponse<AdminAttendanceRow>> {
  const { data } = await apiClient.get<PaginatedResponse<AdminAttendanceRow>>("/attendance", { params });
  return data;
}

export async function adminGetAttendanceById(id: string): Promise<AdminAttendanceRow> {
  const { data } = await apiClient.get<{ attendance: AdminAttendanceRow }>(`/attendance/${id}`);
  return data.attendance;
}

// ─── Monthly attendance ────────────────────────────────────────────────────

export interface MonthlyParams {
  month?: string; // YYYY-MM
  employeeId?: string;
  siteId?: string;
}

export async function getMyMonthly(params: MonthlyParams): Promise<MonthlyGrid> {
  const { data } = await apiClient.get<MonthlyGrid>("/attendance/me/monthly", { params });
  return data;
}

export async function getMonthlyAttendance(params: MonthlyParams): Promise<MonthlyGrid> {
  const { data } = await apiClient.get<MonthlyGrid>("/attendance/admin/monthly", { params });
  return data;
}

export async function downloadMonthlyReport(
  params: MonthlyParams & { format: "excel" | "csv" | "pdf" }
): Promise<void> {
  const { data, headers } = await apiClient.get("/attendance/admin/monthly/export", {
    params,
    responseType: "blob",
  });

  const ext = params.format === "excel" ? "xlsx" : params.format;
  const month = params.month ?? "report";
  const disposition = (headers["content-disposition"] as string | undefined) ?? "";
  const match = /filename="?([^";]+)"?/.exec(disposition);
  const filename = match?.[1] ?? `attendance-${month}.${ext}`;

  const url = window.URL.createObjectURL(new Blob([data]));
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

// ─── Admin manual marking ──────────────────────────────────────────────────

export async function adminCheckToday(
  employeeId: string
): Promise<{ date: string; hasAttendance: boolean; record: AttendanceRecord | null }> {
  const { data } = await apiClient.get(`/attendance/admin/check/${employeeId}`);
  return data;
}

export async function adminMarkPresent(payload: {
  employeeId: string;
  date: string;
  reason?: string;
  override?: boolean;
}): Promise<AttendanceRecord> {
  const { data } = await apiClient.post<{ attendance: AttendanceRecord }>(
    "/attendance/admin/mark-present",
    payload
  );
  return data.attendance;
}

export async function adminMarkAbsent(payload: {
  employeeId: string;
  date: string;
  reason?: string;
  override?: boolean;
}): Promise<AttendanceRecord> {
  const { data } = await apiClient.post<{ attendance: AttendanceRecord }>(
    "/attendance/admin/mark-absent",
    payload
  );
  return data.attendance;
}

// Backward-compatible aliases used by existing pages
export const myToday     = getMyToday;
export const myHistory   = getMyHistory;
export const listAdmin   = adminListAttendance;
