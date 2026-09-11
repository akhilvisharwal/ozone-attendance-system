import type { ExpenseStatus, ReimbursementRequestStatus } from "@/types";

const COMPLETED: ReadonlySet<ExpenseStatus> = new Set(["approved", "paid", "archived"]);

export function canClearCompletedReimbursementRequest(
  requestStatus: ReimbursementRequestStatus,
  expenseStatuses: ExpenseStatus[],
  allItemsCompleted?: boolean
): boolean {
  if (
    requestStatus === "archived" ||
    requestStatus === "rejected" ||
    requestStatus === "pending_approval"
  ) {
    return false;
  }
  if (allItemsCompleted) return true;
  if (expenseStatuses.length === 0) return false;
  return expenseStatuses.every((status) => COMPLETED.has(status));
}
