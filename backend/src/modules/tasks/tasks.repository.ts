import { pool } from "../../config/db";
import { Task, TaskStatus } from "../../types";

const WITH_NAMES = `
  t.*,
  e.name AS employee_name, e.employee_code,
  a.name AS assigned_by_name
`;

export async function createTask(input: {
  employeeId: string;
  assignedBy: string;
  attendanceDate: string | null;
  title: string;
  description: string | null;
  priority: "low" | "medium" | "high";
}): Promise<Task> {
  const result = await pool.query<Task>(
    `INSERT INTO tasks (employee_id, assigned_by, attendance_date, title, description, priority)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [input.employeeId, input.assignedBy, input.attendanceDate, input.title, input.description, input.priority]
  );
  return result.rows[0];
}

export async function updateTaskStatus(id: string, employeeId: string, status: TaskStatus): Promise<Task | null> {
  const completedAt = status === "completed" ? new Date() : null;
  const result = await pool.query<Task>(
    `UPDATE tasks SET status = $1, completed_at = $2
     WHERE id = $3 AND employee_id = $4 RETURNING *`,
    [status, completedAt, id, employeeId]
  );
  return result.rows[0] ?? null;
}

export async function adminUpdateTask(
  id: string,
  input: Partial<{ title: string; description: string; priority: string; status: TaskStatus; attendanceDate: string }>
): Promise<Task | null> {
  const completedAt = input.status === "completed" ? new Date() : undefined;
  const result = await pool.query<Task>(
    `UPDATE tasks SET
       title = COALESCE($1, title),
       description = COALESCE($2, description),
       priority = COALESCE($3, priority),
       status = COALESCE($4, status),
       attendance_date = COALESCE($5, attendance_date),
       completed_at = CASE WHEN $4 = 'completed' THEN now() ELSE completed_at END
     WHERE id = $6 RETURNING *`,
    [
      input.title ?? null,
      input.description ?? null,
      input.priority ?? null,
      input.status ?? null,
      input.attendanceDate ?? null,
      id,
    ]
  );
  void completedAt; // already handled via SQL CASE
  return result.rows[0] ?? null;
}

export async function deleteTask(id: string, employeeId: string): Promise<boolean> {
  const result = await pool.query(
    "DELETE FROM tasks WHERE id = $1 AND employee_id = $2 AND assigned_by = employee_id",
    [id, employeeId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function listMyTasks(
  employeeId: string,
  filters: { date?: string; status?: TaskStatus }
): Promise<Task[]> {
  const conditions: string[] = ["t.employee_id = $1"];
  const values: any[] = [employeeId];

  if (filters.date) {
    values.push(filters.date);
    conditions.push(`t.attendance_date = $${values.length}`);
  }
  if (filters.status) {
    values.push(filters.status);
    conditions.push(`t.status = $${values.length}`);
  }

  const result = await pool.query(
    `SELECT ${WITH_NAMES}
     FROM tasks t
     JOIN employees e ON e.id = t.employee_id
     LEFT JOIN employees a ON a.id = t.assigned_by
     WHERE ${conditions.join(" AND ")}
     ORDER BY t.attendance_date DESC, t.created_at DESC`,
    values
  );
  return result.rows;
}

export async function adminListTasks(filters: {
  employeeId?: string;
  date?: string;
  status?: TaskStatus;
}): Promise<any[]> {
  const conditions: string[] = [];
  const values: any[] = [];

  if (filters.employeeId) {
    values.push(filters.employeeId);
    conditions.push(`t.employee_id = $${values.length}`);
  }
  if (filters.date) {
    values.push(filters.date);
    conditions.push(`t.attendance_date = $${values.length}`);
  }
  if (filters.status) {
    values.push(filters.status);
    conditions.push(`t.status = $${values.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await pool.query(
    `SELECT ${WITH_NAMES}
     FROM tasks t
     JOIN employees e ON e.id = t.employee_id
     LEFT JOIN employees a ON a.id = t.assigned_by
     ${whereClause}
     ORDER BY t.attendance_date DESC, t.created_at DESC`,
    values
  );
  return result.rows;
}

export async function findTaskById(id: string): Promise<Task | null> {
  const result = await pool.query<Task>("SELECT * FROM tasks WHERE id = $1", [id]);
  return result.rows[0] ?? null;
}
