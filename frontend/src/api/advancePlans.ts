import { apiClient } from "./client";
import type { OtpChallengeResponse } from "./emailVerification";

export type AdvanceOtpAction = "create" | "edit" | "delete";

/**
 * Step 1 of the OTP gate shared by every create/edit/delete below: request a
 * code naming the specific employee involved. Uses the advances module's own
 * endpoint (not the generic, master-admin-only one) so Junior Admins with
 * manageAdvances can request codes too.
 */
export async function requestAdvanceOtp(
  action: AdvanceOtpAction,
  employeeId: string
): Promise<OtpChallengeResponse> {
  const res = await apiClient.post<OtpChallengeResponse>("/advances/otp/request", {
    action,
    employeeId,
  });
  return res.data;
}

export type PlanType = "equal_installments" | "custom";
export type PlanStatus = "active" | "completed" | "cancelled";

export interface Installment {
  id: string;
  planId: string;
  installmentNo: number;
  dueDate: string;
  scheduledAmount: number;
  paidAmount: number;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdvancePlan {
  id: string;
  employeeId: string;
  principalAmount: number;
  startDate: string;
  planType: PlanType;
  installmentCount: number;
  status: PlanStatus;
  note: string | null;
  createdBy: string | null;
  createdByName: string | null;
  employeeCode?: string;
  employeeName?: string;
  designation?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdvancePlanWithSchedule extends AdvancePlan {
  installments: Installment[];
  totalPaid: number;
  remainingBalance: number;
}

export interface EmployeeAdvanceSummary {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  designation: string | null;
  activePlanCount: number;
  totalPrincipal: number;
  totalPaid: number;
  remainingBalance: number;
  nextDueDate: string | null;
  nextDueAmount: number | null;
}

/** Present on every create/edit/delete call below — the OTP gate is mandatory, not optional. */
export interface AdvanceOtpFields {
  otpChallengeId: string;
  otpCode: string;
}

export interface CreatePlanPayload extends AdvanceOtpFields {
  employeeId: string;
  principalAmount: number;
  startDate: string;
  planType: PlanType;
  installmentCount?: number;
  installments?: number[];
  note?: string | null;
}

export interface UpdatePlanPayload extends AdvanceOtpFields {
  principalAmount?: number;
  planType?: PlanType;
  installmentCount?: number;
  installments?: number[];
  note?: string | null;
}

export async function listSummaries(): Promise<EmployeeAdvanceSummary[]> {
  const res = await apiClient.get<{ summaries: EmployeeAdvanceSummary[] }>("/advances/plans/summaries");
  return res.data.summaries;
}

export async function listPlansForEmployee(employeeId: string): Promise<AdvancePlanWithSchedule[]> {
  const res = await apiClient.get<{ plans: AdvancePlanWithSchedule[] }>("/advances/plans", {
    params: { employeeId },
  });
  return res.data.plans;
}

export async function getPlan(id: string): Promise<AdvancePlanWithSchedule> {
  const res = await apiClient.get<{ plan: AdvancePlanWithSchedule }>(`/advances/plans/${id}`);
  return res.data.plan;
}

export async function createPlan(payload: CreatePlanPayload): Promise<AdvancePlanWithSchedule> {
  const res = await apiClient.post<{ plan: AdvancePlanWithSchedule }>("/advances/plans", payload);
  return res.data.plan;
}

export async function updatePlan(
  id: string,
  payload: UpdatePlanPayload
): Promise<AdvancePlanWithSchedule> {
  const res = await apiClient.patch<{ plan: AdvancePlanWithSchedule }>(`/advances/plans/${id}`, payload);
  return res.data.plan;
}

export async function cancelPlan(id: string, otp: AdvanceOtpFields): Promise<AdvancePlan> {
  const res = await apiClient.post<{ plan: AdvancePlan }>(`/advances/plans/${id}/cancel`, otp);
  return res.data.plan;
}

export async function deletePlan(id: string, otp: AdvanceOtpFields): Promise<void> {
  await apiClient.delete(`/advances/plans/${id}`, { data: otp });
}

export async function recordRepayment(payload: {
  installmentId: string;
  amount: number;
  entryDate: string;
  note?: string | null;
} & AdvanceOtpFields): Promise<{ plan: AdvancePlanWithSchedule; installment: Installment }> {
  const res = await apiClient.post<{ plan: AdvancePlanWithSchedule; installment: Installment }>(
    "/advances/plans/repayments",
    payload
  );
  return res.data;
}
