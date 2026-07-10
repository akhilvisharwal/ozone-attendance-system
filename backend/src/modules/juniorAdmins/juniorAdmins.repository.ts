import { pool } from "../../config/db";
import { PublicEmployee } from "../../types";
import {
  defaultJuniorAdminPermissions,
  normalizePermissions,
  type AdminPermissions,
} from "../auth/permissions";
import { findEmployeeById, toPublicEmployee } from "../employees/employees.repository";
import type { Employee } from "../../types";

export async function listJuniorAdmins(): Promise<PublicEmployee[]> {
  const result = await pool.query<Employee>(
    `SELECT e.*, d.name AS designation
       FROM employees e
       LEFT JOIN employee_designations d ON d.id = e.designation_id
      WHERE e.role = 'junior_admin' AND e.deleted_at IS NULL
      ORDER BY e.name ASC`
  );
  return result.rows.map(toPublicEmployee);
}

export async function findJuniorAdminById(id: string): Promise<PublicEmployee | null> {
  const result = await pool.query<Employee>(
    `SELECT e.*, d.name AS designation
       FROM employees e
       LEFT JOIN employee_designations d ON d.id = e.designation_id
      WHERE e.id = $1 AND e.role = 'junior_admin' AND e.deleted_at IS NULL`,
    [id]
  );
  return result.rows[0] ? toPublicEmployee(result.rows[0]) : null;
}

export async function createJuniorAdmin(input: {
  employeeCode: string;
  name: string;
  email: string | null;
  phone: string | null;
  passwordHash: string;
  createdBy: string;
  permissions: AdminPermissions;
  isActive: boolean;
}): Promise<PublicEmployee> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO employees (
       employee_code, name, email, phone, password_hash, role, created_by,
       admin_permissions, is_active, must_change_password, first_login_completed,
       weekly_off_days, uses_default_weekly_off
     ) VALUES ($1, $2, $3, $4, $5, 'junior_admin', $6, $7::jsonb, $8, false, false, $9, true)
     RETURNING id`,
    [
      input.employeeCode,
      input.name,
      input.email,
      input.phone,
      input.passwordHash,
      input.createdBy,
      JSON.stringify(input.permissions),
      input.isActive,
      [0],
    ]
  );
  const created = await findJuniorAdminById(result.rows[0].id);
  return created!;
}

export async function updateJuniorAdmin(
  id: string,
  input: {
    name?: string;
    email?: string | null;
    phone?: string | null;
    permissions?: AdminPermissions;
    isActive?: boolean;
  }
): Promise<PublicEmployee | null> {
  const existing = await findEmployeeById(id);
  if (!existing || existing.role !== "junior_admin") return null;

  const permissions = input.permissions
    ? normalizePermissions(input.permissions)
    : normalizePermissions(existing.admin_permissions);

  await pool.query(
    `UPDATE employees SET
       name = COALESCE($1, name),
       email = CASE WHEN $2::boolean THEN $3 ELSE email END,
       phone = CASE WHEN $4::boolean THEN $5 ELSE phone END,
       admin_permissions = $6::jsonb,
       is_active = COALESCE($7, is_active),
       updated_at = now()
     WHERE id = $8 AND role = 'junior_admin' AND deleted_at IS NULL`,
    [
      input.name ?? null,
      input.email !== undefined,
      input.email ?? null,
      input.phone !== undefined,
      input.phone ?? null,
      JSON.stringify(permissions),
      input.isActive ?? null,
      id,
    ]
  );

  return findJuniorAdminById(id);
}

export async function setJuniorAdminActive(id: string, isActive: boolean): Promise<PublicEmployee | null> {
  await pool.query(
    `UPDATE employees SET is_active = $1, updated_at = now()
      WHERE id = $2 AND role = 'junior_admin' AND deleted_at IS NULL`,
    [isActive, id]
  );
  return findJuniorAdminById(id);
}

export async function softDeleteJuniorAdmin(id: string): Promise<PublicEmployee | null> {
  const before = await findJuniorAdminById(id);
  if (!before) return null;
  await pool.query(
    `UPDATE employees SET deleted_at = now(), is_active = false, updated_at = now()
      WHERE id = $1 AND role = 'junior_admin' AND deleted_at IS NULL`,
    [id]
  );
  return { ...before, is_active: false, deleted_at: new Date().toISOString() };
}

export async function nextJuniorAdminCode(): Promise<string> {
  const result = await pool.query<{ employee_code: string }>(
    `SELECT employee_code FROM employees
      WHERE employee_code ~ '^JRADMIN[0-9]+$'
      ORDER BY employee_code DESC
      LIMIT 1`
  );
  const last = result.rows[0]?.employee_code;
  const nextNum = last ? Number(last.replace("JRADMIN", "")) + 1 : 1;
  return `JRADMIN${String(nextNum).padStart(3, "0")}`;
}

export { defaultJuniorAdminPermissions, normalizePermissions };
