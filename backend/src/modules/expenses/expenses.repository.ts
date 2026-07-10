import { pool } from "../../config/db";
import { weekStartMonday } from "./expenseWeek";

export type ExpenseStatus = "draft" | "pending" | "approved" | "rejected" | "paid" | "archived";

export interface ExpenseRow {
  id: string;
  employee_id: string;
  expense_date: string;
  amount: string;
  payment_method: string;
  category: string;
  description: string | null;
  receipt_path: string | null;
  status: ExpenseStatus;
  admin_remarks: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  week_start: string;
  request_id: string | null;
  created_at: string;
  updated_at: string;
  employee_name?: string;
  employee_code?: string;
  reviewed_by_name?: string | null;
  week_paid_at?: string | null;
  week_paid_by_name?: string | null;
}

export interface ExpenseWeekPaymentRow {
  id: string;
  employee_id: string;
  week_start: string;
  paid_at: string;
  paid_by: string | null;
  notes: string | null;
  paid_by_name?: string | null;
}

const SELECT_EXPENSE = `
  e.id, e.employee_id, e.expense_date::text AS expense_date, e.amount::text AS amount,
  e.payment_method, e.category, e.description, e.receipt_path, e.status,
  e.admin_remarks, e.reviewed_by, e.reviewed_at, e.week_start::text AS week_start,
  e.request_id, e.created_at, e.updated_at,
  emp.name AS employee_name, emp.employee_code,
  rev.name AS reviewed_by_name,
  COALESCE(err.paid_at, ewp.paid_at) AS week_paid_at,
  COALESCE(payer_req.name, payer.name) AS week_paid_by_name
`;

const FROM_EXPENSE = `
  expenses e
  JOIN employees emp ON emp.id = e.employee_id
  LEFT JOIN employees rev ON rev.id = e.reviewed_by
  LEFT JOIN expense_reimbursement_requests err ON err.id = e.request_id
  LEFT JOIN employees payer_req ON payer_req.id = err.paid_by
  LEFT JOIN expense_week_payments ewp
    ON ewp.employee_id = e.employee_id AND ewp.week_start = e.week_start AND e.request_id IS NULL
  LEFT JOIN employees payer ON payer.id = ewp.paid_by
`;

export async function createExpense(input: {
  employeeId: string;
  expenseDate: string;
  amount: number;
  paymentMethod: string;
  category: string;
  description: string | null;
  receiptPath: string | null;
}): Promise<ExpenseRow> {
  const weekStart = weekStartMonday(input.expenseDate);
  const result = await pool.query<{ id: string }>(
    `INSERT INTO expenses (
       employee_id, expense_date, amount, payment_method, category,
       description, receipt_path, week_start, status
     ) VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8::date, 'draft')
     RETURNING id`,
    [
      input.employeeId,
      input.expenseDate,
      input.amount,
      input.paymentMethod,
      input.category,
      input.description,
      input.receiptPath,
      weekStart,
    ]
  );
  return (await findExpenseById(result.rows[0].id))!;
}

export async function findExpenseById(id: string): Promise<ExpenseRow | null> {
  const result = await pool.query<ExpenseRow>(
    `SELECT ${SELECT_EXPENSE} FROM ${FROM_EXPENSE} WHERE e.id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function listExpenses(params: {
  employeeId?: string;
  from?: string;
  to?: string;
  weekStart?: string;
  status?: ExpenseStatus;
}): Promise<ExpenseRow[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (params.employeeId) {
    values.push(params.employeeId);
    conditions.push(`e.employee_id = $${values.length}`);
  }
  if (params.from) {
    values.push(params.from);
    conditions.push(`e.expense_date >= $${values.length}::date`);
  }
  if (params.to) {
    values.push(params.to);
    conditions.push(`e.expense_date <= $${values.length}::date`);
  }
  if (params.weekStart) {
    values.push(params.weekStart);
    conditions.push(`e.week_start = $${values.length}::date`);
  }
  if (params.status) {
    values.push(params.status);
    conditions.push(`e.status = $${values.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await pool.query<ExpenseRow>(
    `SELECT ${SELECT_EXPENSE}
       FROM ${FROM_EXPENSE}
       ${where}
      ORDER BY e.week_start DESC, e.expense_date DESC, e.created_at DESC`,
    values
  );
  return result.rows;
}

export async function updateExpense(
  id: string,
  employeeId: string,
  input: {
    expenseDate?: string;
    amount?: number;
    paymentMethod?: string;
    category?: string;
    description?: string | null;
    receiptPath?: string | null;
    clearReceipt?: boolean;
  }
): Promise<ExpenseRow | null> {
  const existing = await findExpenseById(id);
  if (!existing || existing.employee_id !== employeeId) return null;
  if (existing.status !== "draft" || existing.request_id) return null;

  const expenseDate = input.expenseDate ?? existing.expense_date;
  const weekStart = weekStartMonday(expenseDate);
  const receiptPath = input.clearReceipt
    ? null
    : input.receiptPath !== undefined
      ? input.receiptPath
      : existing.receipt_path;

  await pool.query(
    `UPDATE expenses SET
       expense_date = $1::date,
       amount = $2,
       payment_method = $3,
       category = $4,
       description = $5,
       receipt_path = $6,
       week_start = $7::date,
       updated_at = now()
     WHERE id = $8 AND employee_id = $9 AND status = 'draft' AND request_id IS NULL`,
    [
      expenseDate,
      input.amount ?? Number(existing.amount),
      input.paymentMethod ?? existing.payment_method,
      input.category ?? existing.category,
      input.description !== undefined ? input.description : existing.description,
      receiptPath,
      weekStart,
      id,
      employeeId,
    ]
  );
  return findExpenseById(id);
}

export async function deleteExpense(id: string, employeeId: string): Promise<ExpenseRow | null> {
  const existing = await findExpenseById(id);
  if (!existing || existing.employee_id !== employeeId) return null;
  if (existing.status !== "draft" || existing.request_id) return null;
  await pool.query(`DELETE FROM expenses WHERE id = $1 AND employee_id = $2 AND status = 'draft' AND request_id IS NULL`, [
    id,
    employeeId,
  ]);
  return existing;
}

export async function reviewExpense(
  id: string,
  input: {
    status: "approved" | "rejected";
    remarks: string | null;
    reviewedBy: string;
  }
): Promise<ExpenseRow | null> {
  const existing = await findExpenseById(id);
  if (!existing) return null;

  await pool.query(
    `UPDATE expenses SET
       status = $1,
       admin_remarks = $2,
       reviewed_by = $3,
       reviewed_at = now(),
       updated_at = now()
     WHERE id = $4`,
    [input.status, input.remarks, input.reviewedBy, id]
  );
  return findExpenseById(id);
}

export async function markWeekPaid(input: {
  employeeId: string;
  weekStart: string;
  paidBy: string;
  notes: string | null;
}): Promise<ExpenseWeekPaymentRow> {
  const result = await pool.query<ExpenseWeekPaymentRow>(
    `INSERT INTO expense_week_payments (employee_id, week_start, paid_by, notes, paid_at)
     VALUES ($1, $2::date, $3, $4, now())
     ON CONFLICT (employee_id, week_start)
     DO UPDATE SET paid_at = now(), paid_by = EXCLUDED.paid_by, notes = EXCLUDED.notes
     RETURNING id, employee_id, week_start::text AS week_start, paid_at, paid_by, notes`,
    [input.employeeId, input.weekStart, input.paidBy, input.notes]
  );
  return result.rows[0];
}

export async function getWeekPayment(
  employeeId: string,
  weekStart: string
): Promise<ExpenseWeekPaymentRow | null> {
  const result = await pool.query<ExpenseWeekPaymentRow>(
    `SELECT ewp.id, ewp.employee_id, ewp.week_start::text AS week_start,
            ewp.paid_at, ewp.paid_by, ewp.notes, emp.name AS paid_by_name
       FROM expense_week_payments ewp
       LEFT JOIN employees emp ON emp.id = ewp.paid_by
      WHERE ewp.employee_id = $1 AND ewp.week_start = $2::date`,
    [employeeId, weekStart]
  );
  return result.rows[0] ?? null;
}

export interface ExpenseWeekGroup {
  weekStart: string;
  weekEnd: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  totalAmount: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  paidAt: string | null;
  paidByName: string | null;
  expenses: ExpenseRow[];
}

export function groupExpensesByWeek(rows: ExpenseRow[]): ExpenseWeekGroup[] {
  const map = new Map<string, ExpenseWeekGroup>();

  for (const row of rows) {
    const key = `${row.employee_id}:${row.week_start}`;
    let group = map.get(key);
    if (!group) {
      const [y, m, d] = row.week_start.split("-").map(Number);
      const end = new Date(y, m - 1, d);
      end.setDate(end.getDate() + 6);
      const weekEnd = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
      group = {
        weekStart: row.week_start,
        weekEnd,
        employeeId: row.employee_id,
        employeeName: row.employee_name ?? "",
        employeeCode: row.employee_code ?? "",
        totalAmount: 0,
        pendingCount: 0,
        approvedCount: 0,
        rejectedCount: 0,
        paidAt: row.week_paid_at ?? null,
        paidByName: row.week_paid_by_name ?? null,
        expenses: [],
      };
      map.set(key, group);
    }
    group.expenses.push(row);
    group.totalAmount += Number(row.amount);
    if (row.status === "draft") continue;
    if (row.status === "pending") group.pendingCount += 1;
    if (row.status === "approved") group.approvedCount += 1;
    if (row.status === "rejected") group.rejectedCount += 1;
    if (row.week_paid_at) {
      group.paidAt = row.week_paid_at;
      group.paidByName = row.week_paid_by_name ?? null;
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.weekStart === b.weekStart) return a.employeeName.localeCompare(b.employeeName);
    return a.weekStart < b.weekStart ? 1 : -1;
  });
}
