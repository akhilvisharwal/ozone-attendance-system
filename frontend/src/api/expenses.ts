import { apiClient, extractBlobErrorMessage } from "./client";
import type {
  Expense,
  ExpenseReimbursementRequest,
  ExpenseWeekGroup,
  ReimbursementPeriodType,
  ReimbursementRequestStatus,
  RequestExpenseSummary,
} from "@/types";

export interface ExpenseListParams {
  employeeId?: string;
  from?: string;
  to?: string;
  weekStart?: string;
  status?: "draft" | "pending" | "approved" | "rejected" | "paid" | "archived";
  view?: "drafts" | "pending" | "history" | "all";
}

export interface ExpensePayload {
  expenseDate: string;
  amount: number;
  paymentMethod: string;
  category: string;
  description?: string | null;
  receipt?: File | null;
  clearReceipt?: boolean;
}

export interface RequestListParams {
  employeeId?: string;
  status?: ReimbursementRequestStatus;
  from?: string;
  to?: string;
}

function toFormData(payload: ExpensePayload): FormData {
  const form = new FormData();
  form.append("expenseDate", payload.expenseDate);
  form.append("amount", String(payload.amount));
  form.append("paymentMethod", payload.paymentMethod);
  form.append("category", payload.category);
  if (payload.description != null) form.append("description", payload.description);
  if (payload.clearReceipt) form.append("clearReceipt", "true");
  if (payload.receipt) form.append("receipt", payload.receipt);
  return form;
}

function downloadBlob(blob: Blob, filename: string): void {
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(blobUrl);
}

function filenameFromDisposition(disposition: string | undefined, fallback: string): string {
  const match = disposition?.match(/filename="(.+)"/);
  return match?.[1] ?? fallback;
}

export async function getExpenseOptions() {
  const res = await apiClient.get<{
    options: {
      cycles: { weekly: boolean; monthly: boolean; custom: boolean };
      categories: { key: string; label: string; enabled: boolean }[];
      paymentMethods: { key: string; label: string; enabled: boolean }[];
      maxAmountPerExpense: number;
      maxAmountPerRequest: number;
      requireReceiptAbove: number;
      approvalRequired: boolean;
    };
  }>("/expenses/options");
  return res.data.options;
}

export async function listMyExpenses(params?: ExpenseListParams) {
  const res = await apiClient.get<{
    items: Expense[];
    weeks: ExpenseWeekGroup[];
    requests: ExpenseReimbursementRequest[];
  }>("/expenses/mine", { params });
  return res.data;
}

export async function listMyRequests(params?: RequestListParams) {
  const res = await apiClient.get<{ requests: ExpenseReimbursementRequest[] }>(
    "/expenses/requests/mine",
    { params }
  );
  return res.data;
}

export async function submitReimbursementRequest(payload: {
  periodType: ReimbursementPeriodType;
  from?: string;
  to?: string;
}) {
  const res = await apiClient.post<{ request: ExpenseReimbursementRequest }>(
    "/expenses/requests",
    payload
  );
  return res.data.request;
}

export async function createMyExpense(payload: ExpensePayload) {
  const res = await apiClient.post<{ expense: Expense }>("/expenses/mine", toFormData(payload), {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data.expense;
}

export async function updateMyExpense(id: string, payload: ExpensePayload) {
  const res = await apiClient.patch<{ expense: Expense }>(
    `/expenses/mine/${id}`,
    toFormData(payload),
    { headers: { "Content-Type": "multipart/form-data" } }
  );
  return res.data.expense;
}

export async function deleteMyExpense(id: string) {
  await apiClient.delete(`/expenses/mine/${id}`);
}

export async function adminListRequests(params?: RequestListParams) {
  const res = await apiClient.get<{ requests: ExpenseReimbursementRequest[] }>(
    "/expenses/requests",
    { params }
  );
  return res.data;
}

export async function adminGetRequest(id: string) {
  const res = await apiClient.get<{
    request: ExpenseReimbursementRequest;
    expenses: Expense[];
    summary: RequestExpenseSummary;
  }>(`/expenses/requests/${id}`);
  return res.data;
}

export async function adminReviewRequestExpense(
  requestId: string,
  expenseId: string,
  payload: { status: "approved" | "rejected"; remarks?: string | null }
) {
  const res = await apiClient.patch<{
    request: ExpenseReimbursementRequest;
    expense: Expense;
    summary: RequestExpenseSummary;
  }>(`/expenses/requests/${requestId}/expenses/${expenseId}/review`, payload);
  return res.data;
}

export async function adminApproveAllRemaining(requestId: string) {
  const res = await apiClient.post<{
    request: ExpenseReimbursementRequest;
    summary: RequestExpenseSummary;
  }>(`/expenses/requests/${requestId}/approve-remaining`);
  return res.data;
}

export async function adminReviewRequest(
  id: string,
  payload: { status: "approved" | "rejected"; remarks?: string | null }
) {
  const res = await apiClient.patch<{ request: ExpenseReimbursementRequest }>(
    `/expenses/requests/${id}/review`,
    payload
  );
  return res.data.request;
}

export async function adminMarkRequestPaid(id: string, payload?: { notes?: string | null }) {
  const res = await apiClient.post<{ request: ExpenseReimbursementRequest }>(
    `/expenses/requests/${id}/paid`,
    payload ?? {}
  );
  return res.data.request;
}

export async function adminArchiveRequest(id: string) {
  const res = await apiClient.post<{ request: ExpenseReimbursementRequest }>(
    `/expenses/requests/${id}/archive`
  );
  return res.data.request;
}

export async function getReimbursementSummary() {
  const res = await apiClient.get<{
    summary: { requestCount: number; totalAmount: number };
  }>("/expenses/requests/summary");
  return res.data.summary;
}

export async function exportExpenseReport(params: {
  format: "pdf" | "excel";
  period: ReimbursementPeriodType;
  from?: string;
  to?: string;
  employeeId?: string;
}): Promise<void> {
  try {
    const res = await apiClient.get("/expenses/reports/export", {
      params,
      responseType: "blob",
      validateStatus: (status) => status >= 200 && status < 300,
    });

    const blob = res.data as Blob;
    const contentType = String(res.headers["content-type"] ?? "");

    if (contentType.includes("application/json")) {
      const jsonMessage = await parseBlobJsonMessage(blob);
      throw new Error(jsonMessage ?? "Export failed.");
    }

    if (!blob || blob.size === 0) {
      throw new Error("Server returned an empty report file.");
    }

    const disposition = res.headers["content-disposition"] as string | undefined;
    const ext = params.format === "pdf" ? "pdf" : "xlsx";
    const fallback = `expense-report.${ext}`;
    const filename = filenameFromDisposition(disposition, fallback);
    downloadBlob(blob, filename);
  } catch (error) {
    const blobMessage = await extractBlobErrorMessage(error);
    if (blobMessage) throw new Error(blobMessage);
    throw error;
  }
}

async function parseBlobJsonMessage(blob: Blob): Promise<string | null> {
  if (!blob.type.includes("json") && blob.size > 4096) return null;
  try {
    const text = await blob.text();
    const parsed = JSON.parse(text) as { error?: { message?: string } };
    return parsed.error?.message ?? null;
  } catch {
    return null;
  }
}

/** @deprecated Legacy line-item listing */
export async function adminListExpenses(params?: ExpenseListParams) {
  const res = await apiClient.get<{ items: Expense[]; weeks: ExpenseWeekGroup[] }>("/expenses", {
    params,
  });
  return res.data;
}

/** @deprecated Legacy line-item review */
export async function adminReviewExpense(
  id: string,
  payload: { status: "approved" | "rejected"; remarks?: string | null }
) {
  const res = await apiClient.patch<{ expense: Expense }>(`/expenses/${id}/review`, payload);
  return res.data.expense;
}

/** @deprecated Legacy week payment */
export async function adminMarkWeekPaid(payload: {
  employeeId: string;
  weekStart: string;
  notes?: string | null;
}) {
  const res = await apiClient.post<{
    payment: { id: string; paid_at: string };
    weeks: ExpenseWeekGroup[];
  }>("/expenses/weeks/paid", payload);
  return res.data;
}
