import { pool } from "../../config/db";
import type { CompanyHoliday, HolidayType } from "./holidays.service";

const COLUMNS = `
  id, name, description, holiday_type, holiday_date::text AS holiday_date,
  recurring_month, recurring_day, created_at, updated_at
`;

export async function listAllHolidays(year?: number): Promise<CompanyHoliday[]> {
  if (year) {
    const from = `${year}-01-01`;
    const to = `${year}-12-31`;
    const result = await pool.query<CompanyHoliday>(
      `SELECT ${COLUMNS} FROM company_holidays
        WHERE holiday_type = 'recurring'
           OR (holiday_type = 'one_time' AND holiday_date >= $1 AND holiday_date <= $2)
        ORDER BY
          CASE WHEN holiday_type = 'recurring' THEN recurring_month ELSE EXTRACT(MONTH FROM holiday_date::date) END,
          CASE WHEN holiday_type = 'recurring' THEN recurring_day ELSE EXTRACT(DAY FROM holiday_date::date) END,
          name ASC`,
      [from, to]
    );
    return result.rows;
  }

  const result = await pool.query<CompanyHoliday>(
    `SELECT ${COLUMNS} FROM company_holidays
      ORDER BY
        CASE WHEN holiday_type = 'recurring' THEN 0 ELSE 1 END,
        CASE WHEN holiday_type = 'recurring' THEN recurring_month ELSE EXTRACT(MONTH FROM holiday_date::date) END,
        CASE WHEN holiday_type = 'recurring' THEN recurring_day ELSE EXTRACT(DAY FROM holiday_date::date) END,
        name ASC`
  );
  return result.rows;
}

/** Fetches holidays that may apply within a date range (includes all recurring templates). */
export async function listHolidaysForRange(from: string, to: string): Promise<CompanyHoliday[]> {
  const result = await pool.query<CompanyHoliday>(
    `SELECT ${COLUMNS} FROM company_holidays
      WHERE holiday_type = 'recurring'
         OR (holiday_type = 'one_time' AND holiday_date >= $1 AND holiday_date <= $2)
      ORDER BY name ASC`,
    [from, to]
  );
  return result.rows;
}

export async function findHolidayById(id: string): Promise<CompanyHoliday | null> {
  const result = await pool.query<CompanyHoliday>(
    `SELECT ${COLUMNS} FROM company_holidays WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function findOneTimeByDate(date: string): Promise<CompanyHoliday | null> {
  const result = await pool.query<CompanyHoliday>(
    `SELECT ${COLUMNS} FROM company_holidays WHERE holiday_type = 'one_time' AND holiday_date = $1`,
    [date]
  );
  return result.rows[0] ?? null;
}

export async function createHoliday(input: {
  name: string;
  description?: string | null;
  holidayType: HolidayType;
  holidayDate?: string | null;
  recurringMonth?: number | null;
  recurringDay?: number | null;
}): Promise<CompanyHoliday> {
  const result = await pool.query<CompanyHoliday>(
    `INSERT INTO company_holidays (name, description, holiday_type, holiday_date, recurring_month, recurring_day)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${COLUMNS}`,
    [
      input.name,
      input.description ?? null,
      input.holidayType,
      input.holidayType === "one_time" ? input.holidayDate : null,
      input.holidayType === "recurring" ? input.recurringMonth : null,
      input.holidayType === "recurring" ? input.recurringDay : null,
    ]
  );
  return result.rows[0];
}

export async function updateHoliday(
  id: string,
  input: {
    name?: string;
    description?: string | null;
    holidayType?: HolidayType;
    holidayDate?: string | null;
    recurringMonth?: number | null;
    recurringDay?: number | null;
  }
): Promise<CompanyHoliday | null> {
  const existing = await findHolidayById(id);
  if (!existing) return null;

  const type = input.holidayType ?? existing.holiday_type;
  const result = await pool.query<CompanyHoliday>(
    `UPDATE company_holidays SET
       name = COALESCE($1, name),
       description = COALESCE($2, description),
       holiday_type = $3,
       holiday_date = $4,
       recurring_month = $5,
       recurring_day = $6
     WHERE id = $7
     RETURNING ${COLUMNS}`,
    [
      input.name ?? null,
      input.description ?? null,
      type,
      type === "one_time" ? (input.holidayDate ?? existing.holiday_date) : null,
      type === "recurring" ? (input.recurringMonth ?? existing.recurring_month) : null,
      type === "recurring" ? (input.recurringDay ?? existing.recurring_day) : null,
      id,
    ]
  );
  return result.rows[0] ?? null;
}

export async function deleteHoliday(id: string): Promise<boolean> {
  const result = await pool.query("DELETE FROM company_holidays WHERE id = $1", [id]);
  return (result.rowCount ?? 0) > 0;
}
