import { pool } from "../../config/db";
import { Employee, PublicEmployee, Role } from "../../types";
import {
  emptyPermissions,
  fullPermissions,
  normalizePermissions,
  type AdminPermissions,
} from "../auth/permissions";

const EMPLOYEE_SELECT = `
  e.id, e.employee_code, e.name, e.email, e.phone, e.department,
  e.designation_id, d.name AS designation,
  e.role, e.is_active, e.must_change_password, e.first_login_completed, e.profile_photo_path,
  e.created_by, e.deleted_at, e.weekly_off_days, e.uses_default_weekly_off,
  e.admin_permissions, e.created_at, e.updated_at
`;

const EMPLOYEE_FROM = `
  employees e
  LEFT JOIN employee_designations d ON d.id = e.designation_id
`;

export async function findEmployeeByCode(employeeCode: string): Promise<Employee | null> {
  const result = await pool.query<Employee>(
    `SELECT e.*, d.name AS designation
       FROM employees e
       LEFT JOIN employee_designations d ON d.id = e.designation_id
      WHERE e.employee_code = $1 AND e.deleted_at IS NULL`,
    [employeeCode]
  );
  return result.rows[0] ?? null;
}

export async function findEmployeeById(id: string): Promise<Employee | null> {
  const result = await pool.query<Employee>(
    `SELECT e.*, d.name AS designation
       FROM employees e
       LEFT JOIN employee_designations d ON d.id = e.designation_id
      WHERE e.id = $1 AND e.deleted_at IS NULL`,
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
  role: Role;
  createdBy: string;
  designationId?: string | null;
  department?: string | null;
  weeklyOffDays?: number[];
  usesDefaultWeeklyOff?: boolean;
  mustChangePassword?: boolean;
  firstLoginCompleted?: boolean;
  isActive?: boolean;
  adminPermissions?: AdminPermissions;
}): Promise<PublicEmployee> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO employees (
       employee_code, name, email, phone, password_hash, role, created_by,
       designation_id, department,
       weekly_off_days, uses_default_weekly_off, must_change_password, first_login_completed, is_active,
       admin_permissions
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb)
     RETURNING id`,
    [
      input.employeeCode,
      input.name,
      input.email,
      input.phone,
      input.passwordHash,
      input.role,
      input.createdBy,
      input.designationId ?? null,
      input.department ?? null,
      input.weeklyOffDays ?? [0],
      input.usesDefaultWeeklyOff ?? true,
      false,
      input.firstLoginCompleted ?? false,
      input.isActive ?? true,
      JSON.stringify(input.adminPermissions ?? emptyPermissions()),
    ]
  );
  const created = await findEmployeeById(result.rows[0].id);
  return toPublicEmployee(created!);
}

export async function listEmployees(params: {
  search?: string;
  isActive?: boolean;
  designationId?: string;
  page: number;
  limit: number;
}): Promise<{ items: PublicEmployee[]; total: number }> {
  const conditions: string[] = ["e.role = 'employee'", "e.deleted_at IS NULL"];
  const values: any[] = [];

  if (params.search) {
    values.push(`%${params.search}%`);
    conditions.push(
      `(e.name ILIKE $${values.length} OR e.employee_code ILIKE $${values.length} OR d.name ILIKE $${values.length})`
    );
  }
  if (params.isActive !== undefined) {
    values.push(params.isActive);
    conditions.push(`e.is_active = $${values.length}`);
  }
  if (params.designationId) {
    values.push(params.designationId);
    conditions.push(`e.designation_id = $${values.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) FROM ${EMPLOYEE_FROM} ${whereClause}`,
    values
  );

  const offset = (params.page - 1) * params.limit;
  values.push(params.limit, offset);

  const itemsResult = await pool.query<PublicEmployee>(
    `SELECT ${EMPLOYEE_SELECT}
       FROM ${EMPLOYEE_FROM}
       ${whereClause}
     ORDER BY e.created_at DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );

  return { items: itemsResult.rows, total: parseInt(countResult.rows[0].count, 10) };
}

/** All active, non-deleted employees for admin filter dropdowns (no pagination). */
export async function listActiveEmployees(): Promise<PublicEmployee[]> {
  const result = await pool.query<PublicEmployee>(
    `SELECT ${EMPLOYEE_SELECT}
       FROM ${EMPLOYEE_FROM}
      WHERE e.role = 'employee' AND e.deleted_at IS NULL AND e.is_active = true
      ORDER BY e.name ASC`,
    []
  );
  return result.rows;
}

export async function setEmployeeActive(id: string, isActive: boolean): Promise<PublicEmployee | null> {
  const result = await pool.query<{ id: string }>(
    `UPDATE employees SET is_active = $1 WHERE id = $2 AND role = 'employee'
     RETURNING id`,
    [isActive, id]
  );
  if (!result.rows[0]) return null;
  const employee = await findEmployeeById(result.rows[0].id);
  return employee ? toPublicEmployee(employee) : null;
}

export async function updateEmployeePassword(
  id: string,
  passwordHash: string,
  options?: { markFirstLoginComplete?: boolean }
): Promise<void> {
  if (options?.markFirstLoginComplete) {
    await pool.query(
      `UPDATE employees
          SET password_hash = $1,
              first_login_completed = true,
              must_change_password = false,
              password_changed_at = now(),
              updated_at = now()
        WHERE id = $2`,
      [passwordHash, id]
    );
    return;
  }

  await pool.query(
    `UPDATE employees
        SET password_hash = $1,
            must_change_password = false,
            password_changed_at = now(),
            updated_at = now()
      WHERE id = $2`,
    [passwordHash, id]
  );
}

/** @deprecated Legacy column — use first_login_completed instead. */
export async function markMustChangePassword(id: string): Promise<void> {
  await pool.query(
    `UPDATE employees
        SET must_change_password = true,
            first_login_completed = false,
            updated_at = now()
      WHERE id = $1`,
    [id]
  );
}

export async function updateEmployeeProfile(
  id: string,
  input: {
    name?: string;
    email?: string | null;
    phone?: string | null;
    department?: string | null;
    designationId?: string | null;
  }
): Promise<PublicEmployee | null> {
  const result = await pool.query<{ id: string }>(
    `UPDATE employees SET
       name = COALESCE($1, name),
       email = COALESCE($2, email),
       phone = COALESCE($3, phone),
       department = COALESCE($4, department),
       designation_id = COALESCE($5, designation_id),
       updated_at = now()
     WHERE id = $6 AND role = 'employee'
     RETURNING id`,
    [
      input.name ?? null,
      input.email ?? null,
      input.phone ?? null,
      input.department ?? null,
      input.designationId === undefined ? null : input.designationId,
      id,
    ]
  );
  if (!result.rows[0]) return null;
  const employee = await findEmployeeById(result.rows[0].id);
  return employee ? toPublicEmployee(employee) : null;
}

export async function updateProfilePhoto(id: string, photoPath: string | null): Promise<PublicEmployee | null> {
  const result = await pool.query<{ id: string }>(
    `UPDATE employees SET profile_photo_path = $1, updated_at = now() WHERE id = $2 RETURNING id`,
    [photoPath, id]
  );
  if (!result.rows[0]) return null;
  const employee = await findEmployeeById(result.rows[0].id);
  return employee ? toPublicEmployee(employee) : null;
}

/** Sets an employee's weekly off schedule (custom) or restores the company default. */
export async function updateWeeklyOffDays(
  id: string,
  days: number[],
  usesDefaultWeeklyOff: boolean
): Promise<PublicEmployee | null> {
  const unique = Array.from(new Set(days)).sort((a, b) => a - b);
  const result = await pool.query<{ id: string }>(
    `UPDATE employees
        SET weekly_off_days = $1,
            uses_default_weekly_off = $2,
            updated_at = now()
      WHERE id = $3
        AND role = 'employee'
        AND deleted_at IS NULL
     RETURNING id`,
    [unique, usesDefaultWeeklyOff, id]
  );
  if (!result.rows[0]) return null;
  const employee = await findEmployeeById(result.rows[0].id);
  return employee ? toPublicEmployee(employee) : null;
}

/** Lightweight list of active employees (with weekly-off) for the monthly grid. */
export async function listActiveEmployeesForGrid(
  employeeId?: string
): Promise<
  {
    id: string;
    employee_code: string;
    name: string;
    department: string | null;
    designation: string | null;
    weekly_off_days: number[];
    uses_default_weekly_off: boolean;
    created_at: Date;
  }[]
> {
  const conditions = ["e.role = 'employee'", "e.deleted_at IS NULL", "e.is_active = true"];
  const values: unknown[] = [];
  if (employeeId) {
    values.push(employeeId);
    conditions.push(`e.id = $${values.length}`);
  }
  const result = await pool.query<{
    id: string;
    employee_code: string;
    name: string;
    department: string | null;
    designation: string | null;
    weekly_off_days: number[];
    uses_default_weekly_off: boolean;
    created_at: Date;
  }>(
    `SELECT e.id, e.employee_code, e.name, e.department, d.name AS designation,
            e.weekly_off_days, e.uses_default_weekly_off, e.created_at
       FROM employees e
       LEFT JOIN employee_designations d ON d.id = e.designation_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY e.name ASC`,
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
  const before = await findEmployeeById(id);
  if (!before || before.role !== "employee" || before.deleted_at) return null;
  await pool.query(
    `UPDATE employees
       SET deleted_at = now(), is_active = false, updated_at = now()
     WHERE id = $1 AND role = 'employee' AND deleted_at IS NULL`,
    [id]
  );
  // soft-deleted rows are filtered by findEmployeeById — return last known public shape
  return toPublicEmployee({ ...before, deleted_at: new Date().toISOString(), is_active: false });
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
  const { password_hash, admin_permissions, ...rest } = employee;
  const permissions =
    employee.role === "admin"
      ? fullPermissions()
      : employee.role === "junior_admin"
        ? normalizePermissions(admin_permissions)
        : emptyPermissions();
  return { ...rest, admin_permissions: permissions };
}

export async function getEmployeePermissions(employeeId: string): Promise<AdminPermissions> {
  const result = await pool.query<{ role: Role; admin_permissions: unknown }>(
    `SELECT role, admin_permissions FROM employees
      WHERE id = $1 AND deleted_at IS NULL`,
    [employeeId]
  );
  const row = result.rows[0];
  if (!row) return emptyPermissions();
  if (row.role === "admin") return fullPermissions();
  if (row.role !== "junior_admin") return emptyPermissions();
  return normalizePermissions(row.admin_permissions);
}
