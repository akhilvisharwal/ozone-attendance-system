import { pool } from "../../config/db";

export interface EmployeeDesignation {
  id: string;
  name: string;
  is_system: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export async function listDesignations(): Promise<EmployeeDesignation[]> {
  const result = await pool.query<EmployeeDesignation>(
    `SELECT id, name, is_system, created_by, created_at, updated_at
       FROM employee_designations
      ORDER BY is_system DESC, LOWER(name) ASC`
  );
  return result.rows;
}

export async function findDesignationById(id: string): Promise<EmployeeDesignation | null> {
  const result = await pool.query<EmployeeDesignation>(
    `SELECT id, name, is_system, created_by, created_at, updated_at
       FROM employee_designations
      WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function findDesignationByName(name: string): Promise<EmployeeDesignation | null> {
  const result = await pool.query<EmployeeDesignation>(
    `SELECT id, name, is_system, created_by, created_at, updated_at
       FROM employee_designations
      WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))`,
    [normalizeName(name)]
  );
  return result.rows[0] ?? null;
}

export async function createDesignation(
  name: string,
  createdBy: string | null
): Promise<EmployeeDesignation> {
  const result = await pool.query<EmployeeDesignation>(
    `INSERT INTO employee_designations (name, is_system, created_by)
     VALUES ($1, false, $2)
     RETURNING id, name, is_system, created_by, created_at, updated_at`,
    [normalizeName(name), createdBy]
  );
  return result.rows[0];
}

export async function updateDesignation(
  id: string,
  name: string
): Promise<EmployeeDesignation | null> {
  const result = await pool.query<EmployeeDesignation>(
    `UPDATE employee_designations
        SET name = $2, updated_at = now()
      WHERE id = $1
      RETURNING id, name, is_system, created_by, created_at, updated_at`,
    [id, normalizeName(name)]
  );
  return result.rows[0] ?? null;
}

export async function deleteDesignation(id: string): Promise<boolean> {
  // Unused roles may be deleted (including seeded ones). Assigned roles are blocked.
  const result = await pool.query(
    `DELETE FROM employee_designations
      WHERE id = $1
        AND NOT EXISTS (
          SELECT 1 FROM employees e
           WHERE e.designation_id = $1 AND e.deleted_at IS NULL
        )`,
    [id]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function countEmployeesWithDesignation(id: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
       FROM employees
      WHERE designation_id = $1 AND deleted_at IS NULL`,
    [id]
  );
  return parseInt(result.rows[0]?.count ?? "0", 10);
}
