import { apiClient } from "./client";

export type AdvanceEntryType = "taken" | "returned";

export interface AdvanceEntry {
  id: string;
  employeeId: string;
  entryDate: string;
  amount: number;
  entryType: AdvanceEntryType;
  note: string | null;
  createdBy: string | null;
  createdByName: string | null;
  employeeCode?: string;
  employeeName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdvanceListResponse {
  entries: AdvanceEntry[];
  /** Amount currently owed to the company: sum(taken) - sum(returned). */
  balance: number;
  totals: { taken: number; returned: number };
}

export interface AdvancePayload {
  employeeId: string;
  entryDate: string;
  amount: number;
  entryType: AdvanceEntryType;
  note?: string | null;
}

export async function listAdvances(params: {
  employeeId?: string;
  from?: string;
  to?: string;
  entryType?: AdvanceEntryType;
}): Promise<AdvanceListResponse> {
  const res = await apiClient.get<AdvanceListResponse>("/advances", { params });
  return res.data;
}

export async function createAdvance(
  payload: AdvancePayload
): Promise<{ entry: AdvanceEntry; balance: number }> {
  const res = await apiClient.post("/advances", payload);
  return res.data;
}

export async function updateAdvance(
  id: string,
  payload: Partial<Omit<AdvancePayload, "employeeId">>
): Promise<{ entry: AdvanceEntry; balance: number }> {
  const res = await apiClient.patch(`/advances/${id}`, payload);
  return res.data;
}

export async function deleteAdvance(id: string): Promise<{ balance: number }> {
  const res = await apiClient.delete(`/advances/${id}`);
  return res.data;
}

export async function getAllBalances(): Promise<Map<string, number>> {
  const res = await apiClient.get<{ balances: { employeeId: string; balance: number }[] }>(
    "/advances/balances"
  );
  return new Map(res.data.balances.map((b) => [b.employeeId, b.balance]));
}
