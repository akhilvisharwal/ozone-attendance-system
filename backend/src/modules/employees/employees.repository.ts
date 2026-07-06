import { pool } from "../../config/db";
import { Employee, PublicEmployee } from "../../types";

const PUBLIC_COLUMNS = `
  id, employee_code, name, email, phone, department, role, is_active,
  must_change_password, profile_photo_path, created_by, deleted_at,
  weekly_off_days, created_at, updated_at
`;

export async function findEmployeeByCode(employeeCode: string): Promise<Employee | null> {
  const result = await pool.query<Employee>(
    "SELECT * FROM employees WHERE employee_code = $1 AND deleted_at IS NULL",
    [employeeCode]
  );
  return result.rows[0] ?? null;
}

export async function findEmployeeById(id: string): Promise<Employee | null> {
  const result = await pool.query<Employee>(
    "SELECT * FROM employees WHERE id = $1 AND deleted_at IS NULL",
    [id]
  );
  return result.rows[0] ?? null;
}

export async function createEmployee(input: {
  employeeCode: string;
  name: string;
  email: string | null;
  phone: string | null;
  passwordHash: string;
  role: "admin" | "employee";
  createdBy: string;
  weeklyOffDays?: number[];
  mustChangePassword?: boolean;
}): Promise<PublicEmployee> {
  const result = await pool.query<PublicEmployee>(
    `INSERT INTO employees (employee_code, name, email, phone, password_hash, role, created_by, weekly_off_days, must_change_password)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING ${PUBLIC_COLUMNS}`,
    [
      input.employeeCode,
      input.name,
      input.email,
      input.phone,
      input.passwordHash,
      input.role,
      input.createdBy,
      input.weeklyOffDays ?? [0],
      input.mustChangePassword ?? true,
    ]
  );
  return result.rows[0];
}

export async function listEmployees(params: {
  search?: string;
  isActive?: boolean;
  page: number;
  limit: number;
}): Promise<{ items: PublicEmployee[]; total: number }> {
  const conditions: string[] = ["role = 'employee'", "deleted_at IS NULL"];
  const values: any[] = [];

  if (params.search) {
    values.push(`%${params.search}%`);
    conditions.push(`(name ILIKE $${values.length} OR employee_code ILIKE $${values.length})`);
  }
  if (params.isActive !== undefined) {
    values.push(params.isActive);
    conditions.push(`is_active = $${values.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) FROM employees ${whereClause}`,
    values
  );

  const offset = (params.page - 1) * params.limit;
  values.push(params.limit, offset);

  const itemsResult = await pool.query<PublicEmployee>(
    `SELECT ${PUBLIC_COLUMNS} FROM employees ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );

  return { items: itemsResult.rows, total: parseInt(countResult.rows[0].count, 10) };
}

export async function setEmployeeActive(id: string, isActive: boolean): Promise<PublicEmployee | null> {
  const result = await pool.query<PublicEmployee>(
    `UPDATE employees SET is_active = $1 WHERE id = $2 AND role = 'employee'
     RETURNING ${PUBLIC_COLUMNS}`,
    [isActive, id]
  );
  return result.rows[0] ?? null;
}

export async function updateEmployeePassword(
  id: string,
  passwordHash: string,
  mustChangePassword: boolean
): Promise<void> {
  await pool.query(
    "UPDATE employees SET password_hash = $1, must_change_password = $2 WHERE id = $3",
    [passwordHash, mustChangePassword, id]
  );
}

export async function updateEmployeeProfile(
  id: string,
  input: { name?: string; email?: string | null; phone?: string | null; department?: string | null }
): Promise<PublicEmployee | null> {
  const result = await pool.query<PublicEmployee>(
    `UPDATE employees SET
       name = COALESCE($1, name),
       email = COALESCE($2, email),
       phone = COALESCE($3, phone),
       department = COALESCE($4, department)
     WHERE id = $5 AND role = 'employee'
     RETURNING ${PUBLIC_COLUMNS}`,
    [input.name ?? null, input.email ?? null, input.phone ?? null, input.department ?? null, id]
  );
  return result.rows[0] ?? null;
}

export async function updateProfilePhoto(id: string, photoPath: string | null): Promise<PublicEmployee | null> {
  const result = await pool.query<PublicEmployee>(
    `UPDATE employees SET profile_photo_path = $1 WHERE id = $2 RETURNING ${PUBLIC_COLUMNS}`,
    [photoPath, id]
  );
  return result.rows[0] ?? null;
}

/** Sets the employee's individual weekly off days (0=Sun .. 6=Sat). */
export async function updateWeeklyOffDays(id: string, days: number[]): Promise<PublicEmployee | null> {
  const unique = Array.from(new Set(days)).sort((a, b) => a - b);
  const result = await pool.query<PublicEmployee>(
    `UPDATE employees SET weekly_off_days = $1 WHERE id = $2 AND role = 'employee' AND deleted_at IS NULL
     RETURNING ${PUBLIC_COLUMNS}`,
    [unique, id]
  );
  return result.rows[0] ?? null;
}

/** Lightweight list of active employees (with weekly-off) for the monthly grid. */
export async function listActiveEmployeesForGrid(
  employeeId?: string
): Promise<{ id: string; employee_code: string; name: string; department: string | null; weekly_off_days: number[] }[]> {
  const conditions = ["role = 'employee'", "deleted_at IS NULL", "is_active = true"];
  const values: any[] = [];
  if (employeeId) {
    values.push(employeeId);
    conditions.push(`id = $${values.length}`);
  }
  const result = await pool.query<{
    id: string;
    employee_code: string;
    name: string;
    department: string | null;
    weekly_off_days: number[];
  }>(
    `SELECT id, employee_code, name, department, weekly_off_days
       FROM employees
      WHERE ${conditions.join(" AND ")}
      ORDER BY name ASC`,
    values
  );
  return result.rows;
}

export async function countActiveEmployees(): Promise<number> {
  const result = await pool.query<{ count: string }>(
    "SELECT COUNT(*) FROM employees WHERE role = 'employee' AND is_active = true AND deleted_at IS NULL"
  );
  return parseInt(result.rows[0].count, 10);
}

/** Soft-deletes an employee: hidden from lists but historical records are kept. */
export async function softDeleteEmployee(id: string): Promise<PublicEmployee | null> {
  const result = await pool.query<PublicEmployee>(
    `UPDATE employees
       SET deleted_at = now(), is_active = false
     WHERE id = $1 AND role = 'employee' AND deleted_at IS NULL
     RETURNING ${PUBLIC_COLUMNS}`,
    [id]
  );
  return result.rows[0] ?? null;
}

/** Counts related records so the admin can be warned before deleting. */
export async function countEmployeeDependencies(id: string): Promise<{
  attendance: number;
  leaves: number;
  tasks: number;
}> {
  const result = await pool.query<{ attendance: string; leaves: string; tasks: string }>(
    `SELECT
       (SELECT COUNT(*) FROM attendance      WHERE employee_id = $1) AS attendance,
       (SELECT COUNT(*) FROM leave_requests  WHERE employee_id = $1) AS leaves,
       (SELECT COUNT(*) FROM tasks           WHERE employee_id = $1) AS tasks`,
    [id]
  );
  const row = result.rows[0];
  return {
    attendance: parseInt(row?.attendance ?? "0", 10),
    leaves: parseInt(row?.leaves ?? "0", 10),
    tasks: parseInt(row?.tasks ?? "0", 10),
  };
}

export function toPublicEmployee(employee: Employee): PublicEmployee {
  const { password_hash, ...rest } = employee;
  return rest;
}
