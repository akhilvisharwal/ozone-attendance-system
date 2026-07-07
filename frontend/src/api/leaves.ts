import { apiClient } from "./client";
import type { LeaveRequest, LeaveStatus, PaginatedResponse } from "../types";

export interface CreateLeavePayload {
  leaveDate: string;
  leaveType: "full" | "half";
  leaveCategory: string;
  reason: string;
}

export interface LeaveCategoryUsage {
  name: string;
  yearlyLimit: number;
  used: number;
}

export interface LeaveLimits {
  categories: LeaveCategoryUsage[];
}

export interface MyLeavesParams {
  page?: number;
  limit?: number;
}

export interface AdminListLeavesParams {
  status?: LeaveStatus;
  employeeId?: string;
  page?: number;
  limit?: number;
}

export async function submitLeave(payload: CreateLeavePayload): Promise<LeaveRequest> {
  const { data } = await apiClient.post<{ leave: LeaveRequest }>("/leaves", payload);
  return data.leave;
}

export async function myLeaves(params?: MyLeavesParams): Promise<
  PaginatedResponse<LeaveRequest> & { categories?: LeaveCategoryUsage[] }
> {
  const { data } = await apiClient.get<PaginatedResponse<LeaveRequest> & { categories?: LeaveCategoryUsage[] }>(
    "/leaves/mine",
    { params }
  );
  return data;
}

export async function cancelLeave(id: string): Promise<void> {
  await apiClient.delete(`/leaves/${id}`);
}

export async function adminListLeaves(
  params?: AdminListLeavesParams
): Promise<PaginatedResponse<LeaveRequest>> {
  const { data } = await apiClient.get<PaginatedResponse<LeaveRequest>>("/leaves", { params });
  return data;
}

export async function adminGetLeave(id: string): Promise<LeaveRequest> {
  const { data } = await apiClient.get<{ leave: LeaveRequest }>(`/leaves/${id}`);
  return data.leave;
}

export async function adminDeleteLeave(id: string): Promise<void> {
  await apiClient.delete(`/leaves/${id}/admin`);
}

export async function adminReviewLeave(
  id: string,
  payload: { status: "approved" | "rejected"; reviewNote?: string }
): Promise<LeaveRequest> {
  const { data } = await apiClient.patch<{ leave: LeaveRequest }>(`/leaves/${id}/review`, payload);
  return data.leave;
}
