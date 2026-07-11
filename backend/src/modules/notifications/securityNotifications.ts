import { pool } from "../../config/db";
import * as notificationsRepo from "./notifications.repository";

async function listActiveAdminIds(): Promise<string[]> {
  const result = await pool.query<{ id: string }>(
    `SELECT id FROM employees
      WHERE role = 'admin' AND is_active = true AND deleted_at IS NULL`
  );
  return result.rows.map((row) => row.id);
}

/** Security / OTP alerts — always delivered (preferences cannot disable). */
export async function notifySecurityAlert(input: {
  type: string;
  title: string;
  body: string;
  linkPath?: string;
  entityId?: string | null;
  /** When set, notify only these employees; otherwise all active System Admins. */
  employeeIds?: string[];
}): Promise<void> {
  const employeeIds = input.employeeIds?.length ? input.employeeIds : await listActiveAdminIds();
  if (employeeIds.length === 0) return;

  await notificationsRepo.createNotificationsForEmployees(employeeIds, {
    type: input.type,
    title: input.title,
    body: input.body,
    linkPath: input.linkPath ?? "/admin/settings",
    entityId: input.entityId,
  });
}

export async function notifyExpenseReviewed(input: {
  employeeId: string;
  status: "approved" | "rejected";
  amountLabel?: string;
  requestId?: string;
}): Promise<void> {
  const statusLabel = input.status === "approved" ? "approved" : "rejected";
  await notificationsRepo.createNotification({
    employeeId: input.employeeId,
    type: `expense_${statusLabel}`,
    title: `Expense ${statusLabel}`,
    body: input.amountLabel
      ? `Your expense reimbursement was ${statusLabel} (${input.amountLabel}).`
      : `Your expense reimbursement was ${statusLabel}.`,
    linkPath: "/admin/expenses",
    entityId: input.requestId,
  });
}
