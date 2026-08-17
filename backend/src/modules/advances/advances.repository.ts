import type { PoolClient } from "pg";
import { pool } from "../../config/db";

/** Lets a function run inside a caller-owned transaction, or standalone against the pool. */
type Queryable = Pick<typeof pool, "query"> | PoolClient;

export type AdvanceEntryType = "taken" | "returned";

/** Raw row shape. NUMERIC/DATE are cast to text in SQL and parsed at the edge. */
export interface AdvanceRow {
  id: string;
  employee_id: string;
  entry_date: string;
  amount: string;
  entry_type: AdvanceEntryType;
  note: string | null;
  created_by: string | null;
  plan_id: string | null;
  installment_id: string | null;
  created_at: string;
  updated_at: string;
  employee_code?: string;
  employee_name?: string;
  created_by_name?: string | null;
}

export interface AdvanceEntry {
  id: string;
  employeeId: string;
  entryDate: string;
  amount: number;
  entryType: AdvanceEntryType;
  note: string | null;
  createdBy: string | null;
  createdByName: string | null;
  /** Set when this entry is a plan's principal ("taken") or an installment repayment ("returned"). */
  planId: string | null;
  installmentId: string | null;
  employeeCode?: string;
  employeeName?: string;
  createdAt: string;
  updatedAt: string;
}

/** Per-employee advance figures for a single month, plus the cumulative balance. */
export interface AdvanceMonthlyTotals {
  /** Advances taken within the month. */
  taken: number;
  /** Repayments made within the month. */
  returned: number;
  /**
   * Amount still owed to the company as of the last day of that month —
   * cumulative across all time, not just the month. A historical month therefore
   * shows what was outstanding at that month's end, not today's figure.
   */
  balance: number;
}

const SELECT_FIELDS = `
  a.id,
  a.employee_id,
  a.entry_date::text AS entry_date,
  a.amount::text     AS amount,
  a.entry_type,
  a.note,
  a.created_by,
  a.plan_id,
  a.installment_id,
  a.created_at,
  a.updated_at
`;

const RETURNING_FIELDS = `
  id, employee_id, entry_date::text AS entry_date, amount::text AS amount,
  entry_type, note, created_by, plan_id, installment_id, created_at, updated_at
`;

export function mapAdvance(row: AdvanceRow): AdvanceEntry {
  return {
    id: row.id,
    employeeId: row.employee_id,
    entryDate: row.entry_date,
    amount: Number(row.amount),
    entryType: row.entry_type,
    note: row.note,
    createdBy: row.created_by,
    createdByName: row.created_by_name ?? null,
    planId: row.plan_id,
    installmentId: row.installment_id,
    employeeCode: row.employee_code,
    employeeName: row.employee_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createAdvance(
  input: {
    employeeId: string;
    entryDate: string;
    amount: number;
    entryType: AdvanceEntryType;
    note?: string | null;
    createdBy: string;
    planId?: string | null;
    installmentId?: string | null;
  },
  db: Queryable = pool
): Promise<AdvanceEntry> {
  const res = await db.query<AdvanceRow>(
    `INSERT INTO employee_advances (employee_id, entry_date, amount, entry_type, note, created_by, plan_id, installment_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING ${RETURNING_FIELDS}`,
    [
      input.employeeId,
      input.entryDate,
      input.amount,
      input.entryType,
      input.note ?? null,
      input.createdBy,
      input.planId ?? null,
      input.installmentId ?? null,
    ]
  );
  return mapAdvance(res.rows[0]);
}

/** Updates the amount of the single 'taken' ledger row a plan owns, keeping Balance reconciled after a principal edit. */
export async function updatePlanTakenEntryAmount(
  planId: string,
  amount: number,
  db: Queryable = pool
): Promise<void> {
  await db.query(
    `UPDATE employee_advances
        SET amount = $2, updated_at = now()
      WHERE plan_id = $1 AND entry_type = 'taken'`,
    [planId, amount]
  );
}

export async function findAdvanceById(id: string): Promise<AdvanceEntry | null> {
  const res = await pool.query<AdvanceRow>(
    `SELECT ${SELECT_FIELDS} FROM employee_advances a WHERE a.id = $1`,
    [id]
  );
  return res.rows[0] ? mapAdvance(res.rows[0]) : null;
}

export async function updateAdvance(
  id: string,
  input: {
    entryDate?: string;
    amount?: number;
    entryType?: AdvanceEntryType;
    note?: string | null;
  }
): Promise<AdvanceEntry | null> {
  const res = await pool.query<AdvanceRow>(
    `UPDATE employee_advances
        SET entry_date = COALESCE($2, entry_date),
            amount     = COALESCE($3, amount),
            entry_type = COALESCE($4, entry_type),
            note       = CASE WHEN $5::boolean THEN $6 ELSE note END,
            updated_at = now()
      WHERE id = $1
      RETURNING ${RETURNING_FIELDS}`,
    [
      id,
      input.entryDate ?? null,
      input.amount ?? null,
      input.entryType ?? null,
      // note is nullable, so a explicit "clear it" needs to be distinguishable from "leave it".
      input.note !== undefined,
      input.note ?? null,
    ]
  );
  return res.rows[0] ? mapAdvance(res.rows[0]) : null;
}

export async function deleteAdvance(id: string): Promise<boolean> {
  const res = await pool.query(`DELETE FROM employee_advances WHERE id = $1`, [id]);
  return (res.rowCount ?? 0) > 0;
}

/** Ledger for the admin UI — newest first, with actor names resolved. */
export async function listAdvances(filters: {
  employeeId?: string;
  from?: string;
  to?: string;
  entryType?: AdvanceEntryType;
}): Promise<AdvanceEntry[]> {
  const conditions: string[] = ["e.deleted_at IS NULL"];
  const params: unknown[] = [];

  if (filters.employeeId) {
    params.push(filters.employeeId);
    conditions.push(`a.employee_id = $${params.length}`);
  }
  if (filters.from) {
    params.push(filters.from);
    conditions.push(`a.entry_date >= $${params.length}`);
  }
  if (filters.to) {
    params.push(filters.to);
    conditions.push(`a.entry_date <= $${params.length}`);
  }
  if (filters.entryType) {
    params.push(filters.entryType);
    conditions.push(`a.entry_type = $${params.length}`);
  }

  const res = await pool.query<AdvanceRow>(
    `SELECT ${SELECT_FIELDS},
            e.employee_code,
            e.name AS employee_name,
            actor.name AS created_by_name
       FROM employee_advances a
       JOIN employees e     ON e.id = a.employee_id
       LEFT JOIN employees actor ON actor.id = a.created_by
      WHERE ${conditions.join(" AND ")}
      ORDER BY a.entry_date DESC, a.created_at DESC`,
    params
  );
  return res.rows.map(mapAdvance);
}

/**
 * Amount currently owed by one employee: SUM(taken) - SUM(returned).
 * Optionally as of a date (inclusive), for month-end style reporting.
 */
export async function getBalanceForEmployee(
  employeeId: string,
  asOfDate?: string
): Promise<number> {
  const params: unknown[] = [employeeId];
  let dateClause = "";
  if (asOfDate) {
    params.push(asOfDate);
    dateClause = ` AND entry_date <= $2`;
  }

  const res = await pool.query<{ balance: string | null }>(
    `SELECT COALESCE(
              SUM(CASE WHEN entry_type = 'taken' THEN amount ELSE -amount END), 0
            )::text AS balance
       FROM employee_advances
      WHERE employee_id = $1${dateClause}`,
    params
  );
  return Number(res.rows[0]?.balance ?? 0);
}

/**
 * Per-employee advance figures for a month, keyed by employee id.
 *
 * `taken`/`returned` cover the month itself; `balance` is cumulative up to the last
 * day of that month, so the Monthly Attendance view and its exports can answer
 * "what did this employee owe us at the end of this month?" in one pass.
 */
export async function getMonthlyAdvanceTotals(
  monthStart: string,
  monthEnd: string
): Promise<Map<string, AdvanceMonthlyTotals>> {
  const res = await pool.query<{
    employee_id: string;
    taken: string;
    returned: string;
    balance: string;
  }>(
    `SELECT employee_id,
            COALESCE(SUM(amount) FILTER (
              WHERE entry_type = 'taken' AND entry_date BETWEEN $1 AND $2
            ), 0)::text AS taken,
            COALESCE(SUM(amount) FILTER (
              WHERE entry_type = 'returned' AND entry_date BETWEEN $1 AND $2
            ), 0)::text AS returned,
            COALESCE(SUM(
              CASE WHEN entry_type = 'taken' THEN amount ELSE -amount END
            ) FILTER (WHERE entry_date <= $2), 0)::text AS balance
       FROM employee_advances
      WHERE entry_date <= $2
      GROUP BY employee_id`,
    [monthStart, monthEnd]
  );

  const totals = new Map<string, AdvanceMonthlyTotals>();
  for (const row of res.rows) {
    totals.set(row.employee_id, {
      taken: Number(row.taken),
      returned: Number(row.returned),
      balance: Number(row.balance),
    });
  }
  return totals;
}

/** Outstanding balance for every employee, for the Employees list. */
export async function getBalancesForAllEmployees(): Promise<Map<string, number>> {
  const res = await pool.query<{ employee_id: string; balance: string }>(
    `SELECT employee_id,
            COALESCE(SUM(CASE WHEN entry_type = 'taken' THEN amount ELSE -amount END), 0)::text AS balance
       FROM employee_advances
      GROUP BY employee_id`
  );
  const balances = new Map<string, number>();
  for (const row of res.rows) balances.set(row.employee_id, Number(row.balance));
  return balances;
}

/** Guard used before writing: employee must exist, be active, and not be soft-deleted. */
export async function employeeExistsForAdvance(employeeId: string): Promise<boolean> {
  const res = await pool.query<{ id: string }>(
    `SELECT id FROM employees WHERE id = $1 AND deleted_at IS NULL`,
    [employeeId]
  );
  return res.rows.length > 0;
}
