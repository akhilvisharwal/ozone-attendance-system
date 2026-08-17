import { apiClient } from "./client";

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

export interface CreatePlanPayload {
  employeeId: string;
  principalAmount: number;
  startDate: string;
  planType: PlanType;
  installmentCount?: number;
  installments?: number[];
  note?: string | null;
}

export interface UpdatePlanPayload {
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

export async function cancelPlan(id: string): Promise<AdvancePlan> {
  const res = await apiClient.post<{ plan: AdvancePlan }>(`/advances/plans/${id}/cancel`);
  return res.data.plan;
}

export async function deletePlan(id: string): Promise<void> {
  await apiClient.delete(`/advances/plans/${id}`);
}

export async function recordRepayment(payload: {
  installmentId: string;
  amount: number;
  entryDate: string;
  note?: string | null;
}): Promise<{ plan: AdvancePlanWithSchedule; installment: Installment }> {
  const res = await apiClient.post<{ plan: AdvancePlanWithSchedule; installment: Installment }>(
    "/advances/plans/repayments",
    payload
  );
  return res.data;
}
