import { apiClient } from "./client";
import type {
  AttendanceDailyOverride,
  AttendanceOverrideStatus,
} from "@/types/settings";

export interface AttendanceOverrideInput {
  startDate: string;
  endDate: string;
  reason: string;
  applyToAll: boolean;
  employeeIds: string[];
  officeStartTime?: string | null;
  lateCheckInTime?: string | null;
  halfDayCutoff?: string | null;
  officeClosingTime?: string | null;
  minHoursPresent?: number | null;
  minHoursHalfDay?: number | null;
}

export interface AttendanceOverrideListItem extends AttendanceDailyOverride {
  status: AttendanceOverrideStatus;
}

export async function listAttendanceOverrides(): Promise<AttendanceOverrideListItem[]> {
  const { data } = await apiClient.get<{ items: AttendanceOverrideListItem[] }>("/attendance/overrides");
  return data.items;
}

export async function getAttendanceOverride(id: string): Promise<AttendanceOverrideListItem> {
  const { data } = await apiClient.get<{ override: AttendanceOverrideListItem }>(`/attendance/overrides/${id}`);
  return data.override;
}

export async function createAttendanceOverride(
  input: AttendanceOverrideInput
): Promise<AttendanceOverrideListItem> {
  const { data } = await apiClient.post<{ override: AttendanceOverrideListItem }>(
    "/attendance/overrides",
    input
  );
  return data.override;
}

export async function updateAttendanceOverride(
  id: string,
  input: AttendanceOverrideInput
): Promise<AttendanceOverrideListItem> {
  const { data } = await apiClient.patch<{ override: AttendanceOverrideListItem }>(
    `/attendance/overrides/${id}`,
    input
  );
  return data.override;
}

export async function setAttendanceOverrideEnabled(
  id: string,
  isEnabled: boolean
): Promise<AttendanceOverrideListItem> {
  const { data } = await apiClient.patch<{ override: AttendanceOverrideListItem }>(
    `/attendance/overrides/${id}/enabled`,
    { isEnabled }
  );
  return data.override;
}

export async function deleteAttendanceOverride(id: string): Promise<void> {
  await apiClient.delete(`/attendance/overrides/${id}`);
}
