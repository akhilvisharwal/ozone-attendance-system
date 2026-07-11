import { apiClient, extractBlobErrorMessage } from "./client";
import {
  CHECK_IN_API_TIMEOUT_MS,
  CHECK_IN_TIMEOUT_MESSAGE,
  withTimeout,
} from "../utils/async";
import type {
  AttendanceRecord,
  AdminAttendanceRow,
  MonthlyGrid,
  PaginatedResponse,
  TimingRulesResponse,
  WorkStatus,
  SpecialDayStatus,
  AttendanceOverrideNotice,
  ManualAttendancePayload,
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
  workSummary?: string;
  workStatus: WorkStatus;
  remarks?: string;
  sitePhotos?: File[];
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number;
  selfie?: Blob | null;
  deviceInfo?: string;
}

export interface MyHistoryParams {
  page?: number;
  limit?: number;
  from?: string;
  to?: string;
}

export type AdminAttendanceFilterStatus =
  | "present"
  | "half_day"
  | "absent"
  | "pending"
  | "checked_in"
  | "checked_out";

export interface AdminListParams {
  page?: number;
  limit?: number;
  employeeId?: string;
  from?: string;
  to?: string;
  status?: AdminAttendanceFilterStatus;
  sort?: "oldest" | "newest";
}

export async function getTimingRules(date?: string): Promise<TimingRulesResponse> {
  const { data } = await apiClient.get<TimingRulesResponse>("/attendance/timing-rules", {
    params: date ? { date } : undefined,
  });
  return data;
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
  const request = apiClient.post<{ attendance: AttendanceRecord; checkInStatus: string; isHalfDay: boolean }>(
    "/attendance/check-in",
    fd,
    {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: CHECK_IN_API_TIMEOUT_MS,
    }
  );
  const { data } = await withTimeout(request, CHECK_IN_API_TIMEOUT_MS, CHECK_IN_TIMEOUT_MESSAGE);
  return { record: data.attendance, checkInStatus: data.checkInStatus, isHalfDay: data.isHalfDay };
}

export async function checkOut(input: CheckOutInput): Promise<AttendanceRecord> {
  const fd = new FormData();
  if (input.workSummary?.trim()) fd.append("workSummary", input.workSummary.trim());
  fd.append("workStatus", input.workStatus);
  if (input.latitude !== null && input.latitude !== undefined) fd.append("latitude", String(input.latitude));
  if (input.longitude !== null && input.longitude !== undefined) fd.append("longitude", String(input.longitude));
  if (input.accuracy !== undefined) fd.append("accuracy", String(input.accuracy));
  if (input.remarks) fd.append("remarks", input.remarks);
  if (input.deviceInfo) fd.append("deviceInfo", input.deviceInfo);
  if (input.selfie) fd.append("selfie", input.selfie, "selfie.jpg");
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

export interface CheckInContext {
  date: string;
  isWeeklyOff: boolean;
  isHoliday: boolean;
  holidayName: string | null;
  requiresConfirmation: boolean;
  confirmationType: "weekly_off" | "holiday" | null;
  specialDayStatus: SpecialDayStatus | null;
  activeOverride: AttendanceOverrideNotice | null;
}

export async function getCheckInContext(): Promise<CheckInContext> {
  const { data } = await apiClient.get<CheckInContext>("/attendance/me/check-in-context");
  return data;
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
  sort?: "oldest" | "newest";
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
  params: MonthlyParams & { format: "excel" | "pdf" }
): Promise<void> {
  try {
    const { data, headers } = await apiClient.get("/attendance/admin/monthly/export", {
      params,
      responseType: "blob",
      validateStatus: (status) => status >= 200 && status < 300,
    });

    const blob = data as Blob;
    const contentType = String(headers["content-type"] ?? "");
    if (contentType.includes("application/json")) {
      const text = await blob.text();
      let message = "Download failed.";
      try {
        const parsed = JSON.parse(text) as { error?: { message?: string }; message?: string };
        message = parsed.error?.message ?? parsed.message ?? message;
      } catch {
        // keep default message
      }
      throw new Error(message);
    }

    if (!blob || blob.size === 0) {
      throw new Error("Server returned an empty report file.");
    }

    const ext = params.format === "excel" ? "xlsx" : params.format;
    const month = params.month ?? "report";
    const disposition = (headers["content-disposition"] as string | undefined) ?? "";
    const match = /filename="?([^";]+)"?/.exec(disposition);
    const filename = match?.[1] ?? `attendance-${month}.${ext}`;

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  } catch (error) {
    const blobMessage = await extractBlobErrorMessage(error);
    if (blobMessage) throw new Error(blobMessage);
    throw error;
  }
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

export async function adminMarkHalfDay(payload: {
  employeeId: string;
  date: string;
  reason?: string;
  override?: boolean;
}): Promise<AttendanceRecord> {
  const { data } = await apiClient.post<{ attendance: AttendanceRecord }>(
    "/attendance/admin/mark-half-day",
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

export async function adminGetAttendanceForDate(
  employeeId: string,
  date: string
): Promise<AdminAttendanceRow | null> {
  const { data } = await apiClient.get<{ attendance: AdminAttendanceRow | null }>(
    "/attendance/admin/for-date",
    { params: { employeeId, date } }
  );
  return data.attendance;
}

export async function saveManualAttendance(payload: ManualAttendancePayload): Promise<AdminAttendanceRow> {
  const { data } = await apiClient.post<{ attendance: AdminAttendanceRow }>(
    "/attendance/admin/manual-attendance",
    payload
  );
  return data.attendance;
}

export async function deleteManualAttendance(payload: {
  employeeId: string;
  date: string;
}): Promise<void> {
  await apiClient.delete("/attendance/admin/manual-attendance", { data: payload });
}

export async function sendAttendanceReminders(): Promise<{
  date: string;
  sent: number;
  recipients: { id: string; employeeCode: string; name: string }[];
}> {
  const res = await apiClient.post<{
    date: string;
    sent: number;
    recipients: { id: string; employeeCode: string; name: string }[];
  }>("/attendance/admin/remind");
  return res.data;
}

// Backward-compatible aliases used by existing pages
export const myToday     = getMyToday;
export const myHistory   = getMyHistory;
export const listAdmin   = adminListAttendance;
