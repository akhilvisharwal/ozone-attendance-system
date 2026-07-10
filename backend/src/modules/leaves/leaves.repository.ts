import { pool } from "../../config/db";
import { LeaveRequest, LeaveStatus, LeaveType } from "../../types";
import { getCategoryMatchValues } from "../../utils/leaveSettings";

const LEAVE_COLS = `
  lr.*,
  e.name   AS employee_name,
  e.employee_code,
  e.profile_photo_path AS employee_profile_photo_path,
  r.name   AS reviewed_by_name
`;

const JOIN_CLAUSE = `
  FROM leave_requests lr
  JOIN employees e ON e.id = lr.employee_id
  LEFT JOIN employees r ON r.id = lr.reviewed_by
`;

export type LeaveRequestRow = LeaveRequest & {
  employee_name: string;
  employee_code: string;
  employee_profile_photo_path?: string | null;
  reviewed_by_name: string | null;
};

export async function createLeaveRequest(input: {
  employeeId: string;
  leaveDate: string;
  leaveType: LeaveType;
  leaveCategory: string;
  reason: string;
  status?: LeaveStatus;
}): Promise<LeaveRequest> {
  const result = await pool.query<LeaveRequest>(
    `INSERT INTO leave_requests (employee_id, leave_date, leave_type, leave_category, reason, status)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [input.employeeId, input.leaveDate, input.leaveType, input.leaveCategory, input.reason, input.status ?? "pending"]
  );
  return result.rows[0];
}

/** Count approved leave days in a calendar year for quota enforcement. Half-day = 0.5. */
export async function countApprovedLeaveDays(
  employeeId: string,
  category: string,
  year: number
): Promise<number> {
  const matchValues = getCategoryMatchValues(category).map((value) => value.toLowerCase());
  const result = await pool.query<{ days: string }>(
    `SELECT COALESCE(SUM(CASE WHEN leave_type = 'half' THEN 0.5 ELSE 1 END), 0)::text AS days
     FROM leave_requests
     WHERE employee_id = $1
       AND status = 'approved'
       AND EXTRACT(YEAR FROM leave_date::date) = $2
       AND lower(trim(leave_category)) = ANY($3::text[])`,
    [employeeId, year, matchValues]
  );
  return parseFloat(result.rows[0]?.days ?? "0");
}

export async function findLeaveByEmployeeAndDate(
  employeeId: string,
  leaveDate: string
): Promise<LeaveRequest | null> {
  const result = await pool.query<LeaveRequest>(
    `SELECT * FROM leave_requests WHERE employee_id = $1 AND leave_date = $2`,
    [employeeId, leaveDate]
  );
  return result.rows[0] ?? null;
}

export async function listMyLeaveRequests(
  employeeId: string,
  opts: { page: number; limit: number }
): Promise<{ items: LeaveRequestRow[]; total: number }> {
  const offset = (opts.page - 1) * opts.limit;
  const [rows, countRow] = await Promise.all([
    pool.query<LeaveRequestRow>(
      `SELECT ${LEAVE_COLS} ${JOIN_CLAUSE}
       WHERE lr.employee_id = $1
       ORDER BY lr.leave_date DESC
       LIMIT $2 OFFSET $3`,
      [employeeId, opts.limit, offset]
    ),
    pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM leave_requests WHERE employee_id = $1`,
      [employeeId]
    ),
  ]);
  return { items: rows.rows, total: parseInt(countRow.rows[0].total, 10) };
}

export async function adminListLeaveRequests(opts: {
  status?: LeaveStatus;
  employeeId?: string;
  page: number;
  limit: number;
}): Promise<{ items: LeaveRequestRow[]; total: number }> {
  const offset = (opts.page - 1) * opts.limit;
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (opts.status) {
    params.push(opts.status);
    conditions.push(`lr.status = $${params.length}`);
  }
  if (opts.employeeId) {
    params.push(opts.employeeId);
    conditions.push(`lr.employee_id = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const [rows, countRow] = await Promise.all([
    pool.query<LeaveRequestRow>(
      `SELECT ${LEAVE_COLS} ${JOIN_CLAUSE} ${where}
       ORDER BY lr.leave_date DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, opts.limit, offset]
    ),
    pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM leave_requests lr ${where}`,
      params
    ),
  ]);
  return { items: rows.rows, total: parseInt(countRow.rows[0].total, 10) };
}

export async function findLeaveById(id: string): Promise<LeaveRequestRow | null> {
  const result = await pool.query<LeaveRequestRow>(
    `SELECT ${LEAVE_COLS} ${JOIN_CLAUSE} WHERE lr.id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function reviewLeaveRequest(input: {
  id: string;
  status: "approved" | "rejected";
  reviewedBy: string;
  reviewNote: string | null;
}): Promise<LeaveRequest> {
  const result = await pool.query<LeaveRequest>(
    `UPDATE leave_requests SET
       status      = $1,
       reviewed_by = $2,
       review_note = $3,
       reviewed_at = now()
     WHERE id = $4
     RETURNING *`,
    [input.status, input.reviewedBy, input.reviewNote, input.id]
  );
  return result.rows[0];
}

export async function deleteMyLeaveRequest(id: string, employeeId: string): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM leave_requests
     WHERE id = $1 AND employee_id = $2 AND status = 'pending'`,
    [id, employeeId]
  );
  if ((result.rowCount ?? 0) > 0) {
    await pool.query("DELETE FROM app_notifications WHERE entity_id = $1", [id]);
    return true;
  }
  return false;
}

export async function adminDeleteLeaveRequest(id: string): Promise<LeaveRequestRow | null> {
  const existing = await findLeaveById(id);
  if (!existing) return null;

  await pool.query("DELETE FROM app_notifications WHERE entity_id = $1", [id]);
  await pool.query("DELETE FROM leave_requests WHERE id = $1", [id]);
  return existing;
}
