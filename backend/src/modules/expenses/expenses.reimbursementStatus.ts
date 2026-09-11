export type ExpenseLineStatus =
  | "draft"
  | "pending"
  | "approved"
  | "rejected"
  | "paid"
  | "archived";

export type ReimbursementRequestStatus =
  | "pending_approval"
  | "approved"
  | "rejected"
  | "paid"
  | "archived";

export interface ExpenseStatusCounts {
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  paidCount: number;
}

const COMPLETED_EXPENSE_STATUSES: ReadonlySet<ExpenseLineStatus> = new Set([
  "approved",
  "paid",
  "archived",
]);

export function countExpenseStatuses(statuses: ExpenseLineStatus[]): ExpenseStatusCounts {
  const counts: ExpenseStatusCounts = {
    pendingCount: 0,
    approvedCount: 0,
    rejectedCount: 0,
    paidCount: 0,
  };
  for (const status of statuses) {
    if (status === "pending" || status === "draft") counts.pendingCount += 1;
    else if (status === "approved") counts.approvedCount += 1;
    else if (status === "rejected") counts.rejectedCount += 1;
    else if (status === "paid" || status === "archived") counts.paidCount += 1;
  }
  return counts;
}

/**
 * Parent request status follows the child expenses, except paid/archived
 * requests are never moved backwards.
 */
export function deriveReimbursementRequestStatus(
  current: ReimbursementRequestStatus,
  counts: ExpenseStatusCounts
): ReimbursementRequestStatus {
  if (current === "archived") return "archived";
  if (current === "paid") return "paid";
  if (counts.pendingCount > 0) return "pending_approval";
  if (counts.approvedCount > 0 || counts.paidCount > 0) return "approved";
  if (counts.rejectedCount > 0) return "rejected";
  return current;
}

/** True when every line is approved or paid (or already archived) and the request is still active. */
export function canArchiveCompletedRequest(
  requestStatus: ReimbursementRequestStatus,
  expenseStatuses: ExpenseLineStatus[]
): boolean {
  if (
    requestStatus === "archived" ||
    requestStatus === "rejected" ||
    requestStatus === "pending_approval"
  ) {
    return false;
  }
  if (expenseStatuses.length === 0) return false;
  return expenseStatuses.every((status) => COMPLETED_EXPENSE_STATUSES.has(status));
}
