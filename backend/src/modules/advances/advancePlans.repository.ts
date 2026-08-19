import type { PoolClient } from "pg";
import { pool, withTransaction } from "../../config/db";
import { createAdvance, updatePlanTakenEntryAmount } from "./advances.repository";

type Queryable = Pick<typeof pool, "query"> | PoolClient;

export type PlanType = "equal_installments" | "custom";
export type PlanStatus = "active" | "completed" | "cancelled";

export interface InstallmentRow {
  id: string;
  plan_id: string;
  installment_no: number;
  due_date: string;
  scheduled_amount: string;
  paid_amount: string;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

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

export interface PlanRow {
  id: string;
  employee_id: string;
  principal_amount: string;
  start_date: string;
  plan_type: PlanType;
  installment_count: number;
  status: PlanStatus;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  employee_code?: string;
  employee_name?: string;
  designation?: string | null;
  created_by_name?: string | null;
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

/** One row per employee for the overview table — active plans only, aggregated. */
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

function mapInstallment(row: InstallmentRow): Installment {
  return {
    id: row.id,
    planId: row.plan_id,
    installmentNo: row.installment_no,
    dueDate: row.due_date,
    scheduledAmount: Number(row.scheduled_amount),
    paidAmount: Number(row.paid_amount),
    paidAt: row.paid_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPlan(row: PlanRow): AdvancePlan {
  return {
    id: row.id,
    employeeId: row.employee_id,
    principalAmount: Number(row.principal_amount),
    startDate: row.start_date,
    planType: row.plan_type,
    installmentCount: row.installment_count,
    status: row.status,
    note: row.note,
    createdBy: row.created_by,
    createdByName: row.created_by_name ?? null,
    employeeCode: row.employee_code,
    employeeName: row.employee_name,
    designation: row.designation,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Splits `principal` into `count` installments, rounded down to the cent, with the
 * remainder from that rounding added to the last installment — so the schedule
 * always sums exactly to the principal and no fraction of a cent is silently lost.
 */
export function splitEqualInstallments(principal: number, count: number): number[] {
  if (count <= 0) throw new Error("Installment count must be greater than zero");
  const base = Math.floor((principal / count) * 100) / 100;
  const amounts = Array.from({ length: count }, () => base);
  const allocated = base * (count - 1);
  amounts[count - 1] = Math.round((principal - allocated) * 100) / 100;
  return amounts;
}

/** Adds `months` calendar months to a YYYY-MM-DD date, always landing on the 1st. */
export function addMonthsAsFirstOfMonth(dateStr: string, months: number): string {
  const [y, m] = dateStr.split("-").map(Number);
  const total = m - 1 + months;
  const year = y + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  return `${year}-${String(month + 1).padStart(2, "0")}-01`;
}

const PLAN_SELECT_FIELDS = `
  p.id, p.employee_id, p.principal_amount::text AS principal_amount, p.start_date::text AS start_date,
  p.plan_type, p.installment_count, p.status, p.note, p.created_by, p.created_at, p.updated_at
`;

/** Same columns, unqualified — RETURNING clauses have no FROM/alias to reference "p." against. */
const PLAN_RETURNING_FIELDS = `
  id, employee_id, principal_amount::text AS principal_amount, start_date::text AS start_date,
  plan_type, installment_count, status, note, created_by, created_at, updated_at
`;

const PLAN_SELECT_WITH_EMPLOYEE = `
  ${PLAN_SELECT_FIELDS},
  e.employee_code, e.name AS employee_name, d.name AS designation,
  actor.name AS created_by_name
`;

const PLAN_JOINS = `
   FROM employee_advance_plans p
   JOIN employees e ON e.id = p.employee_id
   LEFT JOIN employee_designations d ON d.id = e.designation_id
   LEFT JOIN employees actor ON actor.id = p.created_by
`;

async function insertInstallments(
  planId: string,
  startDate: string,
  amounts: number[],
  db: Queryable
): Promise<void> {
  for (let i = 0; i < amounts.length; i++) {
    await db.query(
      `INSERT INTO employee_advance_installments (plan_id, installment_no, due_date, scheduled_amount)
       VALUES ($1, $2, $3, $4)`,
      [planId, i + 1, addMonthsAsFirstOfMonth(startDate, i), amounts[i]]
    );
  }
}

export async function listInstallmentsForPlan(planId: string, db: Queryable = pool): Promise<Installment[]> {
  const res = await db.query<InstallmentRow>(
    `SELECT id, plan_id, installment_no, due_date::text AS due_date,
            scheduled_amount::text AS scheduled_amount, paid_amount::text AS paid_amount,
            paid_at, created_at, updated_at
       FROM employee_advance_installments
      WHERE plan_id = $1
      ORDER BY installment_no ASC`,
    [planId]
  );
  return res.rows.map(mapInstallment);
}

function withTotals(plan: AdvancePlan, installments: Installment[]): AdvancePlanWithSchedule {
  const totalPaid = installments.reduce((sum, i) => sum + i.paidAmount, 0);
  return {
    ...plan,
    installments,
    totalPaid,
    remainingBalance: Math.max(0, Math.round((plan.principalAmount - totalPaid) * 100) / 100),
  };
}

export async function employeeExists(employeeId: string): Promise<boolean> {
  const res = await pool.query<{ id: string }>(
    `SELECT id FROM employees WHERE id = $1 AND deleted_at IS NULL`,
    [employeeId]
  );
  return res.rows.length > 0;
}

export interface CreatePlanInput {
  employeeId: string;
  principalAmount: number;
  startDate: string;
  planType: PlanType;
  /** Required for equal_installments; ignored for custom (derived from installments.length). */
  installmentCount?: number;
  /** Required for custom; ordered amounts, must sum to principalAmount. */
  installments?: number[];
  note?: string | null;
  createdBy: string;
}

export async function createPlan(input: CreatePlanInput): Promise<AdvancePlanWithSchedule> {
  const amounts =
    input.planType === "equal_installments"
      ? splitEqualInstallments(input.principalAmount, input.installmentCount!)
      : input.installments!;

  return withTransaction(async (client) => {
    const planRes = await client.query<PlanRow>(
      `INSERT INTO employee_advance_plans
         (employee_id, principal_amount, start_date, plan_type, installment_count, note, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${PLAN_RETURNING_FIELDS}`,
      [
        input.employeeId,
        input.principalAmount,
        input.startDate,
        input.planType,
        amounts.length,
        input.note ?? null,
        input.createdBy,
      ]
    );
    const plan = mapPlan(planRes.rows[0]);

    await insertInstallments(plan.id, input.startDate, amounts, client);

    // The principal is a real ledger event ("money left the company") — recorded as
    // an ordinary 'taken' entry so Monthly Attendance's existing Adv Taken / Balance
    // columns pick it up automatically, same as a loose entry would.
    await createAdvance(
      {
        employeeId: input.employeeId,
        entryDate: input.startDate,
        amount: input.principalAmount,
        entryType: "taken",
        note: input.note ?? `Advance plan (${amounts.length} installment${amounts.length === 1 ? "" : "s"})`,
        createdBy: input.createdBy,
        planId: plan.id,
      },
      client
    );

    const installments = await listInstallmentsForPlan(plan.id, client);
    return withTotals(plan, installments);
  });
}

export async function getPlanById(id: string): Promise<AdvancePlanWithSchedule | null> {
  const res = await pool.query<PlanRow>(
    `SELECT ${PLAN_SELECT_WITH_EMPLOYEE} ${PLAN_JOINS} WHERE p.id = $1`,
    [id]
  );
  if (!res.rows[0]) return null;
  const plan = mapPlan(res.rows[0]);
  const installments = await listInstallmentsForPlan(plan.id);
  return withTotals(plan, installments);
}

/** All plans for one employee (any status), newest first — for the detail view. */
export async function listPlansForEmployee(employeeId: string): Promise<AdvancePlanWithSchedule[]> {
  const res = await pool.query<PlanRow>(
    `SELECT ${PLAN_SELECT_WITH_EMPLOYEE} ${PLAN_JOINS}
      WHERE p.employee_id = $1 AND e.deleted_at IS NULL
      ORDER BY p.start_date DESC, p.created_at DESC`,
    [employeeId]
  );
  const plans = res.rows.map(mapPlan);
  const withSchedules = await Promise.all(
    plans.map(async (plan) => withTotals(plan, await listInstallmentsForPlan(plan.id)))
  );
  return withSchedules;
}

/** One row per employee with at least one active plan — the overview table. */
export async function listEmployeeAdvanceSummaries(): Promise<EmployeeAdvanceSummary[]> {
  const res = await pool.query<{
    employee_id: string;
    employee_code: string;
    employee_name: string;
    designation: string | null;
    active_plan_count: string;
    total_principal: string;
    total_paid: string;
    next_due_date: string | null;
    next_due_amount: string | null;
  }>(
    `WITH active_plans AS (
       SELECT p.*, e.employee_code, e.name AS employee_name, d.name AS designation
         FROM employee_advance_plans p
         JOIN employees e ON e.id = p.employee_id AND e.deleted_at IS NULL
         LEFT JOIN employee_designations d ON d.id = e.designation_id
        WHERE p.status = 'active'
     ),
     installment_totals AS (
       SELECT ap.employee_id,
              SUM(i.paid_amount) AS paid
         FROM active_plans ap
         JOIN employee_advance_installments i ON i.plan_id = ap.id
        GROUP BY ap.employee_id
     ),
     -- Earliest unpaid due date per employee, across all their active plans.
     next_due_date AS (
       SELECT ap.employee_id, MIN(i.due_date) AS due_date
         FROM active_plans ap
         JOIN employee_advance_installments i ON i.plan_id = ap.id
        WHERE i.scheduled_amount > i.paid_amount
        GROUP BY ap.employee_id
     ),
     -- Sum every installment due that date, in case two plans share the same due date —
     -- a naive "pick one row" would silently drop the other plan's amount.
     next_due AS (
       SELECT ndd.employee_id, ndd.due_date,
              SUM(i.scheduled_amount - i.paid_amount) AS remaining
         FROM next_due_date ndd
         JOIN active_plans ap ON ap.employee_id = ndd.employee_id
         JOIN employee_advance_installments i
           ON i.plan_id = ap.id AND i.due_date = ndd.due_date AND i.scheduled_amount > i.paid_amount
        GROUP BY ndd.employee_id, ndd.due_date
     )
     SELECT
       ap.employee_id,
       MIN(ap.employee_code)   AS employee_code,
       MIN(ap.employee_name)   AS employee_name,
       MIN(ap.designation)     AS designation,
       COUNT(*)                AS active_plan_count,
       SUM(ap.principal_amount)::text AS total_principal,
       COALESCE(MIN(it.paid), 0)::text AS total_paid,
       MIN(nd.due_date)::text  AS next_due_date,
       MIN(nd.remaining)::text AS next_due_amount
     FROM active_plans ap
     LEFT JOIN installment_totals it ON it.employee_id = ap.employee_id
     LEFT JOIN next_due nd ON nd.employee_id = ap.employee_id
     GROUP BY ap.employee_id
     ORDER BY employee_name ASC`
  );

  return res.rows.map((row) => {
    const totalPrincipal = Number(row.total_principal);
    const totalPaid = Number(row.total_paid);
    return {
      employeeId: row.employee_id,
      employeeCode: row.employee_code,
      employeeName: row.employee_name,
      designation: row.designation,
      activePlanCount: Number(row.active_plan_count),
      totalPrincipal,
      totalPaid,
      remainingBalance: Math.max(0, Math.round((totalPrincipal - totalPaid) * 100) / 100),
      nextDueDate: row.next_due_date,
      nextDueAmount: row.next_due_amount != null ? Number(row.next_due_amount) : null,
    };
  });
}

/**
 * Sum of scheduled_amount, per employee, for installments due within [monthStart,
 * monthEnd] — "what was supposed to come back this month per the plan." Only active
 * and completed plans count; a cancelled plan's future installments are no longer
 * being tracked, so they don't appear as due.
 */
export async function getMonthlyScheduledTotals(
  monthStart: string,
  monthEnd: string
): Promise<Map<string, number>> {
  const res = await pool.query<{ employee_id: string; scheduled: string }>(
    `SELECT p.employee_id, SUM(i.scheduled_amount)::text AS scheduled
       FROM employee_advance_installments i
       JOIN employee_advance_plans p ON p.id = i.plan_id
      WHERE i.due_date BETWEEN $1 AND $2
        AND p.status IN ('active', 'completed')
      GROUP BY p.employee_id`,
    [monthStart, monthEnd]
  );
  const totals = new Map<string, number>();
  for (const row of res.rows) totals.set(row.employee_id, Number(row.scheduled));
  return totals;
}

export interface UpdatePlanInput {
  principalAmount?: number;
  planType?: PlanType;
  installmentCount?: number;
  installments?: number[];
  note?: string | null;
  updatedBy: string;
}

/**
 * Edits an active plan's principal and/or schedule.
 *
 * Rule (documented, not guessed): every installment with paid_amount > 0 is kept
 * exactly as-is — payment history is never rewritten. Every installment with
 * paid_amount = 0 is deleted and replaced with a fresh schedule covering
 * (new principal − already paid), continuing the month after the last kept
 * installment (or the plan's start date if nothing has been paid yet). If the new
 * principal would be less than what's already been paid, the edit is rejected.
 */
export async function updatePlan(id: string, input: UpdatePlanInput): Promise<AdvancePlanWithSchedule> {
  return withTransaction(async (client) => {
    const planRes = await client.query<PlanRow>(
      `SELECT ${PLAN_SELECT_FIELDS} FROM employee_advance_plans p WHERE p.id = $1 FOR UPDATE`,
      [id]
    );
    if (!planRes.rows[0]) throw new PlanNotFoundError();
    const plan = mapPlan(planRes.rows[0]);
    if (plan.status !== "active") throw new PlanNotEditableError(plan.status);

    const installments = await listInstallmentsForPlan(id, client);
    const kept = installments.filter((i) => i.paidAmount > 0).sort((a, b) => a.installmentNo - b.installmentNo);
    const totalPaid = kept.reduce((sum, i) => sum + i.paidAmount, 0);

    const newPrincipal = input.principalAmount ?? plan.principalAmount;
    if (newPrincipal < totalPaid) {
      throw new PlanPrincipalTooLowError(totalPaid);
    }

    // Drop every unpaid installment; kept ones are untouched.
    await client.query(
      `DELETE FROM employee_advance_installments WHERE plan_id = $1 AND paid_amount = 0`,
      [id]
    );

    const remainingBalance = Math.round((newPrincipal - totalPaid) * 100) / 100;
    const nextInstallmentNo = kept.length > 0 ? kept[kept.length - 1].installmentNo + 1 : 1;
    const continueFrom =
      kept.length > 0 ? addMonthsAsFirstOfMonth(kept[kept.length - 1].dueDate, 1) : plan.startDate;

    let newAmounts: number[] = [];
    const planType = input.planType ?? plan.planType;
    if (remainingBalance > 0) {
      if (planType === "equal_installments") {
        const count = input.installmentCount ?? Math.max(1, plan.installmentCount - kept.length);
        newAmounts = splitEqualInstallments(remainingBalance, count);
      } else {
        newAmounts = input.installments ?? [];
        const sum = Math.round(newAmounts.reduce((s, a) => s + a, 0) * 100) / 100;
        if (Math.round(remainingBalance * 100) !== Math.round(sum * 100)) {
          throw new CustomScheduleMismatchError(remainingBalance, sum);
        }
      }
    }

    for (let i = 0; i < newAmounts.length; i++) {
      await client.query(
        `INSERT INTO employee_advance_installments (plan_id, installment_no, due_date, scheduled_amount)
         VALUES ($1, $2, $3, $4)`,
        [id, nextInstallmentNo + i, addMonthsAsFirstOfMonth(continueFrom, i), newAmounts[i]]
      );
    }

    const newStatus = remainingBalance <= 0 ? "completed" : "active";
    const updatedRes = await client.query<PlanRow>(
      `UPDATE employee_advance_plans
          SET principal_amount = $2,
              plan_type = $3,
              installment_count = $4,
              status = $5,
              note = COALESCE($6, note),
              updated_at = now()
        WHERE id = $1
        RETURNING ${PLAN_RETURNING_FIELDS}`,
      [id, newPrincipal, planType, kept.length + newAmounts.length, newStatus, input.note ?? null]
    );

    if (newPrincipal !== plan.principalAmount) {
      await updatePlanTakenEntryAmount(id, newPrincipal, client);
    }

    const finalInstallments = await listInstallmentsForPlan(id, client);
    return withTotals(mapPlan(updatedRes.rows[0]), finalInstallments);
  });
}

export async function cancelPlan(id: string): Promise<AdvancePlan> {
  const res = await pool.query<PlanRow>(
    `UPDATE employee_advance_plans SET status = 'cancelled', updated_at = now()
      WHERE id = $1 AND status = 'active'
      RETURNING ${PLAN_RETURNING_FIELDS}`,
    [id]
  );
  if (!res.rows[0]) throw new PlanNotFoundError();
  return mapPlan(res.rows[0]);
}

/** Only allowed when nothing has been paid yet — otherwise cancel, to keep payment history. */
export async function deletePlanIfUnpaid(id: string): Promise<boolean> {
  return withTransaction(async (client) => {
    const res = await client.query<{ total_paid: string }>(
      `SELECT COALESCE(SUM(paid_amount), 0)::text AS total_paid
         FROM employee_advance_installments WHERE plan_id = $1`,
      [id]
    );
    const totalPaid = Number(res.rows[0]?.total_paid ?? 0);
    if (totalPaid > 0) throw new PlanHasPaymentsError();

    // employee_advances.plan_id is ON DELETE SET NULL (by design — deleting a plan must
    // never silently delete real repayment history). But totalPaid = 0 here means the
    // only ledger row this plan owns is its 'taken' principal entry, and deleting an
    // unpaid plan is specifically "this was a mistake, undo it" — so that ledger row
    // must be removed too, or it survives as an orphaned, invisible-in-the-UI debt that
    // still counts toward Balance forever. Installments cascade via their own FK.
    await client.query(`DELETE FROM employee_advances WHERE plan_id = $1`, [id]);
    const del = await client.query(`DELETE FROM employee_advance_plans WHERE id = $1`, [id]);
    return (del.rowCount ?? 0) > 0;
  });
}

/** Cheap lookup used only to pre-check an OTP challenge's employee context before recordRepayment runs. */
export async function findEmployeeIdForInstallment(installmentId: string): Promise<string | null> {
  const result = await pool.query<{ employee_id: string }>(
    `SELECT p.employee_id
       FROM employee_advance_installments i
       JOIN employee_advance_plans p ON p.id = i.plan_id
      WHERE i.id = $1`,
    [installmentId]
  );
  return result.rows[0]?.employee_id ?? null;
}

export interface RecordRepaymentInput {
  installmentId: string;
  amount: number;
  entryDate: string;
  note?: string | null;
  createdBy: string;
}

export async function recordRepayment(
  input: RecordRepaymentInput
): Promise<{ plan: AdvancePlanWithSchedule; installment: Installment }> {
  return withTransaction(async (client) => {
    const instRes = await client.query<InstallmentRow>(
      `SELECT id, plan_id, installment_no, due_date::text AS due_date,
              scheduled_amount::text AS scheduled_amount, paid_amount::text AS paid_amount,
              paid_at, created_at, updated_at
         FROM employee_advance_installments WHERE id = $1 FOR UPDATE`,
      [input.installmentId]
    );
    if (!instRes.rows[0]) throw new InstallmentNotFoundError();
    const installment = mapInstallment(instRes.rows[0]);

    const planRes = await client.query<PlanRow>(
      `SELECT ${PLAN_SELECT_FIELDS} FROM employee_advance_plans p WHERE p.id = $1 FOR UPDATE`,
      [installment.planId]
    );
    const plan = mapPlan(planRes.rows[0]);
    if (plan.status === "cancelled") throw new PlanNotEditableError(plan.status);

    const updatedRes = await client.query<InstallmentRow>(
      `UPDATE employee_advance_installments
          SET paid_amount = paid_amount + $2, paid_at = now(), updated_at = now()
        WHERE id = $1
        RETURNING id, plan_id, installment_no, due_date::text AS due_date,
                  scheduled_amount::text AS scheduled_amount, paid_amount::text AS paid_amount,
                  paid_at, created_at, updated_at`,
      [input.installmentId, input.amount]
    );
    const updatedInstallment = mapInstallment(updatedRes.rows[0]);

    await createAdvance(
      {
        employeeId: plan.employeeId,
        entryDate: input.entryDate,
        amount: input.amount,
        entryType: "returned",
        note: input.note ?? `Installment #${installment.installmentNo} repayment`,
        createdBy: input.createdBy,
        planId: plan.id,
        installmentId: installment.id,
      },
      client
    );

    const allInstallments = await listInstallmentsForPlan(plan.id, client);
    const totalPaid = allInstallments.reduce((sum, i) => sum + i.paidAmount, 0);
    if (totalPaid >= plan.principalAmount - 0.005 && plan.status === "active") {
      await client.query(
        `UPDATE employee_advance_plans SET status = 'completed', updated_at = now() WHERE id = $1`,
        [plan.id]
      );
      plan.status = "completed";
    }

    return { plan: withTotals(plan, allInstallments), installment: updatedInstallment };
  });
}

export class PlanNotFoundError extends Error {
  constructor() {
    super("Advance plan not found");
  }
}
export class InstallmentNotFoundError extends Error {
  constructor() {
    super("Installment not found");
  }
}
export class PlanNotEditableError extends Error {
  constructor(status: PlanStatus) {
    super(`Plan is ${status} and can no longer be edited`);
  }
}
export class PlanPrincipalTooLowError extends Error {
  constructor(alreadyPaid: number) {
    super(`New principal cannot be less than the amount already paid (${alreadyPaid.toFixed(2)})`);
  }
}
export class CustomScheduleMismatchError extends Error {
  constructor(expected: number, actual: number) {
    super(`Installments must sum to ${expected.toFixed(2)}, got ${actual.toFixed(2)}`);
  }
}
export class PlanHasPaymentsError extends Error {
  constructor() {
    super("This plan has recorded payments — cancel it instead of deleting");
  }
}
