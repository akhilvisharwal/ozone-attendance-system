import { pool } from "../../config/db";
import type { ReimbursementPeriodType } from "./expensePeriod";
import { formatPeriodLabel } from "./expensePeriod";
import * as repo from "./expenses.repository";
import type { ExpenseRow } from "./expenses.repository";

export type ReimbursementRequestStatus =
  | "pending_approval"
  | "approved"
  | "rejected"
  | "paid"
  | "archived";

export interface ReimbursementRequestRow {
  id: string;
  employee_id: string;
  period_type: ReimbursementPeriodType;
  period_start: string;
  period_end: string;
  status: ReimbursementRequestStatus;
  requested_amount: string;
  approved_amount: string | null;
  admin_remarks: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  paid_at: string | null;
  paid_by: string | null;
  payment_notes: string | null;
  submitted_at: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  employee_name?: string;
  employee_code?: string;
  reviewed_by_name?: string | null;
  paid_by_name?: string | null;
  expense_count?: number;
}

const SELECT_REQUEST = `
  r.id, r.employee_id, r.period_type, r.period_start::text AS period_start,
  r.period_end::text AS period_end, r.status, r.requested_amount::text AS requested_amount,
  r.approved_amount::text AS approved_amount, r.admin_remarks, r.reviewed_by, r.reviewed_at,
  r.paid_at, r.paid_by, r.payment_notes, r.submitted_at, r.archived_at,
  r.created_at, r.updated_at,
  emp.name AS employee_name, emp.employee_code,
  rev.name AS reviewed_by_name, payer.name AS paid_by_name
`;

const FROM_REQUEST = `
  expense_reimbursement_requests r
  JOIN employees emp ON emp.id = r.employee_id
  LEFT JOIN employees rev ON rev.id = r.reviewed_by
  LEFT JOIN employees payer ON payer.id = r.paid_by
`;

export async function findRequestById(id: string): Promise<ReimbursementRequestRow | null> {
  const result = await pool.query<ReimbursementRequestRow>(
    `SELECT ${SELECT_REQUEST},
            (SELECT COUNT(*)::int FROM expenses e WHERE e.request_id = r.id) AS expense_count
       FROM ${FROM_REQUEST}
      WHERE r.id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function listRequests(params: {
  employeeId?: string;
  status?: ReimbursementRequestStatus | ReimbursementRequestStatus[];
  from?: string;
  to?: string;
}): Promise<ReimbursementRequestRow[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (params.employeeId) {
    values.push(params.employeeId);
    conditions.push(`r.employee_id = $${values.length}`);
  }
  if (params.status) {
    const statuses = Array.isArray(params.status) ? params.status : [params.status];
    values.push(statuses);
    conditions.push(`r.status = ANY($${values.length}::text[])`);
  }
  if (params.from) {
    values.push(params.from);
    conditions.push(`r.period_end >= $${values.length}::date`);
  }
  if (params.to) {
    values.push(params.to);
    conditions.push(`r.period_start <= $${values.length}::date`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await pool.query<ReimbursementRequestRow>(
    `SELECT ${SELECT_REQUEST},
            (SELECT COUNT(*)::int FROM expenses e WHERE e.request_id = r.id) AS expense_count
       FROM ${FROM_REQUEST}
       ${where}
      ORDER BY r.submitted_at DESC`,
    values
  );
  return result.rows;
}

export async function listDraftExpensesInRange(
  employeeId: string,
  start: string,
  end: string
): Promise<{ id: string; amount: string; receipt_path: string | null }[]> {
  const result = await pool.query<{ id: string; amount: string; receipt_path: string | null }>(
    `SELECT id, amount::text AS amount, receipt_path
       FROM expenses
      WHERE employee_id = $1
        AND status = 'draft'
        AND request_id IS NULL
        AND expense_date >= $2::date
        AND expense_date <= $3::date
      ORDER BY expense_date ASC`,
    [employeeId, start, end]
  );
  return result.rows;
}

export async function submitReimbursementRequest(input: {
  employeeId: string;
  periodType: ReimbursementPeriodType;
  periodStart: string;
  periodEnd: string;
  expenseIds: string[];
  requestedAmount: number;
  /** When approval is disabled in settings, submit directly as approved. */
  autoApprove?: boolean;
  reviewedBy?: string | null;
}): Promise<ReimbursementRequestRow> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const requestStatus = input.autoApprove ? "approved" : "pending_approval";
    const expenseStatus = input.autoApprove ? "approved" : "pending";

    const requestRes = await client.query<{ id: string }>(
      `INSERT INTO expense_reimbursement_requests (
         employee_id, period_type, period_start, period_end, status, requested_amount,
         approved_amount, reviewed_by, reviewed_at, admin_remarks
       ) VALUES (
         $1, $2, $3::date, $4::date, $5::varchar, $6,
         $7, $8,
         CASE WHEN $5::text = 'approved' THEN now() ELSE NULL END,
         CASE WHEN $5::text = 'approved' THEN 'Auto-approved (approval not required)' ELSE NULL END
       )
       RETURNING id`,
      [
        input.employeeId,
        input.periodType,
        input.periodStart,
        input.periodEnd,
        requestStatus,
        input.requestedAmount,
        input.autoApprove ? input.requestedAmount : null,
        input.autoApprove ? (input.reviewedBy ?? null) : null,
      ]
    );
    const requestId = requestRes.rows[0].id;

    await client.query(
      `UPDATE expenses
          SET status = $1::varchar,
              request_id = $2,
              reviewed_by = $3,
              reviewed_at = CASE WHEN $1::text = 'approved' THEN now() ELSE NULL END,
              admin_remarks = CASE WHEN $1::text = 'approved' THEN 'Auto-approved (approval not required)' ELSE NULL END,
              updated_at = now()
        WHERE employee_id = $4
          AND id = ANY($5::uuid[])
          AND status = 'draft'
          AND request_id IS NULL`,
      [
        expenseStatus,
        requestId,
        input.autoApprove ? (input.reviewedBy ?? null) : null,
        input.employeeId,
        input.expenseIds,
      ]
    );

    await client.query("COMMIT");
    return (await findRequestById(requestId))!;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export interface RequestExpenseSummary {
  totalSubmitted: number;
  approvedAmount: number;
  rejectedAmount: number;
  pendingAmount: number;
  payableAmount: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  reviewedCount: number;
}

async function getRequestExpenseSummaryWithClient(
  client: { query: typeof pool.query },
  requestId: string
): Promise<RequestExpenseSummary> {
  const result = await client.query<{
    total_submitted: string;
    approved_amount: string;
    rejected_amount: string;
    pending_amount: string;
    pending_count: string;
    approved_count: string;
    rejected_count: string;
  }>(
    `SELECT
       COALESCE(SUM(amount), 0)::text AS total_submitted,
       COALESCE(SUM(amount) FILTER (WHERE status = 'approved'), 0)::text AS approved_amount,
       COALESCE(SUM(amount) FILTER (WHERE status = 'rejected'), 0)::text AS rejected_amount,
       COALESCE(SUM(amount) FILTER (WHERE status = 'pending'), 0)::text AS pending_amount,
       COUNT(*) FILTER (WHERE status = 'pending')::text AS pending_count,
       COUNT(*) FILTER (WHERE status = 'approved')::text AS approved_count,
       COUNT(*) FILTER (WHERE status = 'rejected')::text AS rejected_count
      FROM expenses
     WHERE request_id = $1`,
    [requestId]
  );
  const row = result.rows[0];
  const approvedAmount = Number(row?.approved_amount ?? 0);
  const rejectedAmount = Number(row?.rejected_amount ?? 0);
  const pendingAmount = Number(row?.pending_amount ?? 0);
  const pendingCount = parseInt(row?.pending_count ?? "0", 10);
  const approvedCount = parseInt(row?.approved_count ?? "0", 10);
  const rejectedCount = parseInt(row?.rejected_count ?? "0", 10);
  return {
    totalSubmitted: Number(row?.total_submitted ?? 0),
    approvedAmount,
    rejectedAmount,
    pendingAmount,
    payableAmount: approvedAmount,
    pendingCount,
    approvedCount,
    rejectedCount,
    reviewedCount: approvedCount + rejectedCount,
  };
}

export async function getRequestExpenseSummary(requestId: string): Promise<RequestExpenseSummary> {
  return getRequestExpenseSummaryWithClient(pool, requestId);
}

async function syncRequestStatusFromExpenses(
  client: { query: typeof pool.query },
  requestId: string,
  reviewedBy: string
): Promise<void> {
  const summary = await getRequestExpenseSummaryWithClient(client, requestId);

  if (summary.pendingCount > 0) {
    await client.query(
      `UPDATE expense_reimbursement_requests SET
         status = 'pending_approval',
         approved_amount = CASE WHEN $2 > 0 THEN $2 ELSE NULL END,
         updated_at = now()
       WHERE id = $1`,
      [requestId, summary.approvedAmount]
    );
    return;
  }

  const nextStatus = summary.approvedCount > 0 ? "approved" : "rejected";
  await client.query(
    `UPDATE expense_reimbursement_requests SET
       status = $1,
       approved_amount = $2,
       reviewed_by = $3,
       reviewed_at = now(),
       updated_at = now()
     WHERE id = $4`,
    [nextStatus, summary.approvedCount > 0 ? summary.approvedAmount : null, reviewedBy, requestId]
  );
}

export async function reviewRequestExpense(
  requestId: string,
  expenseId: string,
  input: {
    status: "approved" | "rejected";
    remarks: string | null;
    reviewedBy: string;
  }
): Promise<{ request: ReimbursementRequestRow; expense: ExpenseRow } | null> {
  const existing = await findRequestById(requestId);
  if (!existing || existing.status !== "pending_approval") return null;

  const expenseRes = await pool.query<{ id: string; status: string }>(
    `SELECT id, status FROM expenses WHERE id = $1 AND request_id = $2`,
    [expenseId, requestId]
  );
  const expenseRow = expenseRes.rows[0];
  if (!expenseRow || expenseRow.status !== "pending") return null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `UPDATE expenses SET
         status = $1,
         admin_remarks = $2,
         reviewed_by = $3,
         reviewed_at = now(),
         updated_at = now()
       WHERE id = $4`,
      [
        input.status,
        input.status === "rejected" ? input.remarks : null,
        input.reviewedBy,
        expenseId,
      ]
    );

    await syncRequestStatusFromExpenses(client, requestId, input.reviewedBy);

    await client.query("COMMIT");

    const request = await findRequestById(requestId);
    const expense = await repo.findExpenseById(expenseId);
    if (!request || !expense) return null;
    return { request, expense };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function approveAllRemainingRequestExpenses(
  requestId: string,
  reviewedBy: string
): Promise<ReimbursementRequestRow | null> {
  const existing = await findRequestById(requestId);
  if (!existing || existing.status !== "pending_approval") return null;

  const summary = await getRequestExpenseSummary(requestId);
  if (summary.pendingCount === 0 || summary.reviewedCount === 0) return null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `UPDATE expenses SET
         status = 'approved',
         admin_remarks = NULL,
         reviewed_by = $1,
         reviewed_at = now(),
         updated_at = now()
       WHERE request_id = $2 AND status = 'pending'`,
      [reviewedBy, requestId]
    );

    await syncRequestStatusFromExpenses(client, requestId, reviewedBy);

    await client.query("COMMIT");
    return findRequestById(requestId);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function reviewRequest(
  id: string,
  input: {
    status: "approved" | "rejected";
    remarks: string | null;
    reviewedBy: string;
    approvedAmount?: number | null;
  }
): Promise<ReimbursementRequestRow | null> {
  const existing = await findRequestById(id);
  if (!existing || existing.status !== "pending_approval") return null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const expenseStatus = input.status === "approved" ? "approved" : "rejected";
    await client.query(
      `UPDATE expense_reimbursement_requests SET
         status = $1,
         admin_remarks = $2,
         reviewed_by = $3,
         reviewed_at = now(),
         approved_amount = $4,
         updated_at = now()
       WHERE id = $5`,
      [
        input.status,
        input.remarks,
        input.reviewedBy,
        input.status === "approved" ? (input.approvedAmount ?? Number(existing.requested_amount)) : null,
        id,
      ]
    );

    await client.query(
      `UPDATE expenses SET status = $1, admin_remarks = $2, reviewed_by = $3, reviewed_at = now(), updated_at = now()
        WHERE request_id = $4 AND status = 'pending'`,
      [expenseStatus, input.remarks, input.reviewedBy, id]
    );

    await client.query("COMMIT");
    return findRequestById(id);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function markRequestPaid(
  id: string,
  input: { paidBy: string; notes: string | null; archiveImmediately: boolean }
): Promise<ReimbursementRequestRow | null> {
  const existing = await findRequestById(id);
  if (!existing || existing.status !== "approved") return null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const nextStatus = input.archiveImmediately ? "archived" : "paid";
    const archivedAt = input.archiveImmediately ? new Date().toISOString() : null;

    await client.query(
      `UPDATE expense_reimbursement_requests SET
         status = $1,
         paid_at = now(),
         paid_by = $2,
         payment_notes = $3,
         archived_at = COALESCE($4::timestamptz, archived_at),
         updated_at = now()
       WHERE id = $5`,
      [nextStatus, input.paidBy, input.notes, archivedAt, id]
    );

    const expenseStatus = input.archiveImmediately ? "archived" : "paid";
    await client.query(
      `UPDATE expenses SET status = $1, updated_at = now()
        WHERE request_id = $2 AND status = 'approved'`,
      [expenseStatus, id]
    );

    await client.query("COMMIT");
    return findRequestById(id);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function archivePaidRequest(id: string): Promise<ReimbursementRequestRow | null> {
  const existing = await findRequestById(id);
  if (!existing || existing.status !== "paid") return null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE expense_reimbursement_requests SET status = 'archived', archived_at = now(), updated_at = now()
        WHERE id = $1`,
      [id]
    );
    await client.query(
      `UPDATE expenses SET status = 'archived', updated_at = now()
        WHERE request_id = $1 AND status = 'paid'`,
      [id]
    );
    await client.query("COMMIT");
    return findRequestById(id);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Archive paid requests whose paid_at is at least `days` old. No-op when days <= 0. */
export async function archivePaidRequestsOlderThan(days: number): Promise<number> {
  if (days <= 0) return 0;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const reqRes = await client.query<{ id: string }>(
      `UPDATE expense_reimbursement_requests
          SET status = 'archived', archived_at = now(), updated_at = now()
        WHERE status = 'paid'
          AND paid_at IS NOT NULL
          AND paid_at <= now() - ($1::int * interval '1 day')
        RETURNING id`,
      [days]
    );
    const ids = reqRes.rows.map((row) => row.id);
    if (ids.length > 0) {
      await client.query(
        `UPDATE expenses SET status = 'archived', updated_at = now()
          WHERE request_id = ANY($1::uuid[]) AND status = 'paid'`,
        [ids]
      );
    }
    await client.query("COMMIT");
    return ids.length;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function getPendingReimbursementTotal(): Promise<{
  requestCount: number;
  totalAmount: number;
}> {
  const result = await pool.query<{ request_count: string; total_amount: string }>(
    `SELECT COUNT(*)::text AS request_count,
            COALESCE(SUM(requested_amount), 0)::text AS total_amount
       FROM expense_reimbursement_requests
      WHERE status = 'pending_approval'`
  );
  const row = result.rows[0];
  return {
    requestCount: parseInt(row?.request_count ?? "0", 10),
    totalAmount: Number(row?.total_amount ?? 0),
  };
}

export async function countArchivedExpenseRecords(): Promise<{
  requestCount: number;
  expenseCount: number;
  receiptPaths: string[];
}> {
  const [reqRes, expRes, pathsRes] = await Promise.all([
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM expense_reimbursement_requests WHERE status = 'archived'`
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM expenses e
         JOIN expense_reimbursement_requests r ON r.id = e.request_id
        WHERE r.status = 'archived'`
    ),
    pool.query<{ receipt_path: string }>(
      `SELECT e.receipt_path
         FROM expenses e
         JOIN expense_reimbursement_requests r ON r.id = e.request_id
        WHERE r.status = 'archived' AND e.receipt_path IS NOT NULL`
    ),
  ]);
  return {
    requestCount: parseInt(reqRes.rows[0]?.count ?? "0", 10),
    expenseCount: parseInt(expRes.rows[0]?.count ?? "0", 10),
    receiptPaths: pathsRes.rows.map((r) => r.receipt_path).filter(Boolean),
  };
}

export async function deleteArchivedExpenseData(): Promise<{
  deletedRequests: number;
  deletedExpenses: number;
  deletedFiles: number;
  receiptPaths: string[];
}> {
  const paths = (
    await pool.query<{ receipt_path: string }>(
      `SELECT e.receipt_path
         FROM expenses e
         JOIN expense_reimbursement_requests r ON r.id = e.request_id
        WHERE r.status = 'archived' AND e.receipt_path IS NOT NULL`
    )
  ).rows.map((r) => r.receipt_path).filter(Boolean);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const expRes = await client.query(
      `DELETE FROM expenses
        WHERE request_id IN (
          SELECT id FROM expense_reimbursement_requests WHERE status = 'archived'
        )`
    );
    const reqRes = await client.query(
      `DELETE FROM expense_reimbursement_requests WHERE status = 'archived'`
    );
    await client.query("COMMIT");
    return {
      deletedExpenses: expRes.rowCount ?? 0,
      deletedRequests: reqRes.rowCount ?? 0,
      deletedFiles: paths.length,
      receiptPaths: paths,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export function requestPeriodLabel(row: ReimbursementRequestRow): string {
  return formatPeriodLabel(row.period_type, row.period_start, row.period_end);
}
