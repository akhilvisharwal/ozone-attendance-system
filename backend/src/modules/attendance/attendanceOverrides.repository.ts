import { pool } from "../../config/db";
import type { AttendanceDailyOverrideRow, OverrideEmployeeSummary } from "./attendanceOverrides.types";

const COLUMNS = `
  id,
  start_date::text AS start_date,
  end_date::text AS end_date,
  reason,
  office_start_time,
  late_check_in_time,
  half_day_cutoff,
  office_closing_time,
  min_hours_present,
  min_hours_half_day,
  is_enabled,
  apply_to_all,
  created_by,
  created_at,
  updated_at
`;

export interface OverrideWriteInput {
  startDate: string;
  endDate: string;
  reason: string;
  officeStartTime?: string | null;
  lateCheckInTime?: string | null;
  halfDayCutoff?: string | null;
  officeClosingTime?: string | null;
  minHoursPresent?: number | null;
  minHoursHalfDay?: number | null;
  applyToAll: boolean;
  employeeIds?: string[];
  createdBy?: string | null;
}

async function loadEmployeesForOverrides(
  overrideIds: string[]
): Promise<Map<string, OverrideEmployeeSummary[]>> {
  const map = new Map<string, OverrideEmployeeSummary[]>();
  if (overrideIds.length === 0) return map;

  const result = await pool.query<{
    override_id: string;
    id: string;
    employee_code: string;
    name: string;
  }>(
    `SELECT oe.override_id, e.id, e.employee_code, e.name
       FROM attendance_daily_override_employees oe
       JOIN employees e ON e.id = oe.employee_id
      WHERE oe.override_id = ANY($1::uuid[])
      ORDER BY e.name ASC`,
    [overrideIds]
  );

  for (const row of result.rows) {
    const list = map.get(row.override_id) ?? [];
    list.push({ id: row.id, employeeCode: row.employee_code, name: row.name });
    map.set(row.override_id, list);
  }
  return map;
}

export async function listAllOverrides(): Promise<{
  rows: AttendanceDailyOverrideRow[];
  employeesByOverride: Map<string, OverrideEmployeeSummary[]>;
}> {
  const result = await pool.query<AttendanceDailyOverrideRow>(
    `SELECT ${COLUMNS}
       FROM attendance_daily_overrides
      ORDER BY start_date DESC, end_date DESC, created_at DESC`
  );
  const employeesByOverride = await loadEmployeesForOverrides(result.rows.map((row) => row.id));
  return { rows: result.rows, employeesByOverride };
}

export async function findOverrideById(id: string): Promise<AttendanceDailyOverrideRow | null> {
  const result = await pool.query<AttendanceDailyOverrideRow>(
    `SELECT ${COLUMNS} FROM attendance_daily_overrides WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function findOverrideWithEmployees(id: string): Promise<{
  row: AttendanceDailyOverrideRow;
  employees: OverrideEmployeeSummary[];
} | null> {
  const row = await findOverrideById(id);
  if (!row) return null;
  const employeesByOverride = await loadEmployeesForOverrides([row.id]);
  return { row, employees: employeesByOverride.get(row.id) ?? [] };
}

export async function listEnabledOverridesForDate(date: string): Promise<{
  rows: AttendanceDailyOverrideRow[];
  employeesByOverride: Map<string, OverrideEmployeeSummary[]>;
}> {
  const result = await pool.query<AttendanceDailyOverrideRow>(
    `SELECT ${COLUMNS}
       FROM attendance_daily_overrides
      WHERE is_enabled = true
        AND start_date <= $1::date
        AND end_date >= $1::date
      ORDER BY updated_at DESC, created_at DESC`,
    [date]
  );
  const employeesByOverride = await loadEmployeesForOverrides(result.rows.map((row) => row.id));
  return { rows: result.rows, employeesByOverride };
}

export async function findOverrideForEmployeeAndDate(
  employeeId: string,
  date: string
): Promise<AttendanceDailyOverrideRow | null> {
  const result = await pool.query<AttendanceDailyOverrideRow>(
    `SELECT ${COLUMNS}
       FROM attendance_daily_overrides o
      WHERE o.is_enabled = true
        AND o.start_date <= $2::date
        AND o.end_date >= $2::date
        AND (
          o.apply_to_all = true
          OR EXISTS (
            SELECT 1
              FROM attendance_daily_override_employees oe
             WHERE oe.override_id = o.id
               AND oe.employee_id = $1
          )
        )
      ORDER BY o.updated_at DESC, o.created_at DESC
      LIMIT 1`,
    [employeeId, date]
  );
  return result.rows[0] ?? null;
}

export async function hasAssignmentConflict(
  startDate: string,
  endDate: string,
  applyToAll: boolean,
  employeeIds: string[],
  excludeId?: string
): Promise<boolean> {
  const values: unknown[] = [startDate, endDate, applyToAll, employeeIds];
  let excludeClause = "";
  if (excludeId) {
    values.push(excludeId);
    excludeClause = `AND o.id <> $${values.length}`;
  }

  const result = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
         FROM attendance_daily_overrides o
        WHERE o.is_enabled = true
          AND o.start_date <= $2::date
          AND o.end_date >= $1::date
          ${excludeClause}
          AND (
            o.apply_to_all = true
            OR $3 = true
            OR EXISTS (
              SELECT 1
                FROM attendance_daily_override_employees oe
               WHERE oe.override_id = o.id
                 AND oe.employee_id = ANY($4::uuid[])
            )
          )
     ) AS exists`,
    values
  );
  return Boolean(result.rows[0]?.exists);
}

export async function setOverrideEmployees(overrideId: string, employeeIds: string[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM attendance_daily_override_employees WHERE override_id = $1", [
      overrideId,
    ]);
    if (employeeIds.length > 0) {
      await client.query(
        `INSERT INTO attendance_daily_override_employees (override_id, employee_id)
         SELECT $1, unnest($2::uuid[])`,
        [overrideId, employeeIds]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function createOverride(input: OverrideWriteInput): Promise<AttendanceDailyOverrideRow> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<AttendanceDailyOverrideRow>(
      `INSERT INTO attendance_daily_overrides (
         start_date, end_date, reason,
         office_start_time, late_check_in_time, half_day_cutoff, office_closing_time,
         min_hours_present, min_hours_half_day, apply_to_all, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING ${COLUMNS}`,
      [
        input.startDate,
        input.endDate,
        input.reason,
        input.officeStartTime ?? null,
        input.lateCheckInTime ?? null,
        input.halfDayCutoff ?? null,
        input.officeClosingTime ?? null,
        input.minHoursPresent ?? null,
        input.minHoursHalfDay ?? null,
        input.applyToAll,
        input.createdBy ?? null,
      ]
    );
    const row = result.rows[0];
    if (!input.applyToAll && input.employeeIds && input.employeeIds.length > 0) {
      await client.query(
        `INSERT INTO attendance_daily_override_employees (override_id, employee_id)
         SELECT $1, unnest($2::uuid[])`,
        [row.id, input.employeeIds]
      );
    }
    await client.query("COMMIT");
    return row;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function updateOverride(
  id: string,
  input: OverrideWriteInput
): Promise<AttendanceDailyOverrideRow | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<AttendanceDailyOverrideRow>(
      `UPDATE attendance_daily_overrides SET
         start_date = $1,
         end_date = $2,
         reason = $3,
         office_start_time = $4,
         late_check_in_time = $5,
         half_day_cutoff = $6,
         office_closing_time = $7,
         min_hours_present = $8,
         min_hours_half_day = $9,
         apply_to_all = $10,
         updated_at = now()
       WHERE id = $11
       RETURNING ${COLUMNS}`,
      [
        input.startDate,
        input.endDate,
        input.reason,
        input.officeStartTime ?? null,
        input.lateCheckInTime ?? null,
        input.halfDayCutoff ?? null,
        input.officeClosingTime ?? null,
        input.minHoursPresent ?? null,
        input.minHoursHalfDay ?? null,
        input.applyToAll,
        id,
      ]
    );
    const row = result.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return null;
    }
    await client.query("DELETE FROM attendance_daily_override_employees WHERE override_id = $1", [id]);
    if (!input.applyToAll && input.employeeIds && input.employeeIds.length > 0) {
      await client.query(
        `INSERT INTO attendance_daily_override_employees (override_id, employee_id)
         SELECT $1, unnest($2::uuid[])`,
        [id, input.employeeIds]
      );
    }
    await client.query("COMMIT");
    return row;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function setOverrideEnabled(id: string, isEnabled: boolean): Promise<AttendanceDailyOverrideRow | null> {
  const result = await pool.query<AttendanceDailyOverrideRow>(
    `UPDATE attendance_daily_overrides
        SET is_enabled = $1, updated_at = now()
      WHERE id = $2
      RETURNING ${COLUMNS}`,
    [isEnabled, id]
  );
  return result.rows[0] ?? null;
}

export async function deleteOverride(id: string): Promise<boolean> {
  const result = await pool.query("DELETE FROM attendance_daily_overrides WHERE id = $1", [id]);
  return (result.rowCount ?? 0) > 0;
}
