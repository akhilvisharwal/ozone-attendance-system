import { pool } from "../../config/db";
import { AttendanceRecord, CheckInStatus, CheckOutStatus, DayStatus, WorkStatus } from "../../types";

const ADMIN_LIST_SELECT = `
  a.*,
  e.employee_code, e.name AS employee_name,
  s.name AS site_name
`;

export async function findTodayAttendance(employeeId: string, date: string): Promise<AttendanceRecord | null> {
  const result = await pool.query<AttendanceRecord>(
    `SELECT a.*, s.name AS site_name
     FROM attendance a
     LEFT JOIN sites s ON s.id = a.site_id
     WHERE a.employee_id = $1 AND a.attendance_date = $2`,
    [employeeId, date]
  );
  return result.rows[0] ?? null;
}

export async function findAttendanceById(id: string): Promise<AttendanceRecord | null> {
  const result = await pool.query<AttendanceRecord>("SELECT * FROM attendance WHERE id = $1", [id]);
  return result.rows[0] ?? null;
}

export async function findAttendanceWithSiteById(id: string): Promise<(AttendanceRecord & { site_name: string | null }) | null> {
  const result = await pool.query(
    `SELECT a.*, s.name AS site_name
     FROM attendance a
     LEFT JOIN sites s ON s.id = a.site_id
     WHERE a.id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function createCheckIn(input: {
  employeeId: string;
  date: string;
  checkInTime: Date;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  selfiePath: string;
  deviceInfo: string | null;
  checkInStatus: CheckInStatus;
  isHalfDay: boolean;
  siteId: string;
  workSummary: string | null;
  workStatus: WorkStatus | null;
}): Promise<AttendanceRecord> {
  const result = await pool.query<AttendanceRecord>(
    `INSERT INTO attendance (
       employee_id, attendance_date, check_in_time,
       check_in_latitude, check_in_longitude, check_in_address,
       check_in_selfie_path, check_in_device_info,
       check_in_status, is_half_day, status,
       site_id, work_summary, work_status
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'checked_in', $11, $12, $13)
     RETURNING *`,
    [
      input.employeeId,
      input.date,
      input.checkInTime,
      input.latitude,
      input.longitude,
      input.address,
      input.selfiePath,
      input.deviceInfo,
      input.checkInStatus,
      input.isHalfDay,
      input.siteId,
      input.workSummary,
      input.workStatus,
    ]
  );
  return result.rows[0];
}

export async function completeCheckOut(input: {
  id: string;
  checkOutTime: Date;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  workSummary: string;
  workStatus: WorkStatus;
  remarks: string | null;
  sitePhotoPaths: string[];
  totalMinutes: number;
  checkOutStatus: CheckOutStatus;
  dayStatus: DayStatus;
}): Promise<AttendanceRecord> {
  // The site is chosen at check-in, so it is intentionally left untouched here.
  // is_half_day is kept in sync with the hours-based day_status result.
  const result = await pool.query<AttendanceRecord>(
    `UPDATE attendance SET
       check_out_time = $1,
       check_out_latitude = $2,
       check_out_longitude = $3,
       check_out_address = $4,
       work_summary = $5,
       work_status = $6,
       remarks = $7,
       site_photo_paths = $8,
       total_minutes = $9,
       check_out_status = $10,
       day_status = $11,
       is_half_day = $12,
       status = 'checked_out'
     WHERE id = $13
     RETURNING *`,
    [
      input.checkOutTime,
      input.latitude,
      input.longitude,
      input.address,
      input.workSummary,
      input.workStatus,
      input.remarks,
      JSON.stringify(input.sitePhotoPaths),
      input.totalMinutes,
      input.checkOutStatus,
      input.dayStatus,
      input.dayStatus === "half_day",
      input.id,
    ]
  );
  return result.rows[0];
}

export async function listMyAttendance(
  employeeId: string,
  filters: { from?: string; to?: string; page: number; limit: number }
): Promise<{ items: (AttendanceRecord & { site_name: string | null })[]; total: number }> {
  const conditions: string[] = ["a.employee_id = $1"];
  const values: any[] = [employeeId];

  if (filters.from) {
    values.push(filters.from);
    conditions.push(`a.attendance_date >= $${values.length}`);
  }
  if (filters.to) {
    values.push(filters.to);
    conditions.push(`a.attendance_date <= $${values.length}`);
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) FROM attendance a ${whereClause}`,
    values
  );

  const offset = (filters.page - 1) * filters.limit;
  values.push(filters.limit, offset);

  const itemsResult = await pool.query(
    `SELECT a.*, s.name AS site_name
     FROM attendance a
     LEFT JOIN sites s ON s.id = a.site_id
     ${whereClause}
     ORDER BY a.attendance_date DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );

  return { items: itemsResult.rows, total: parseInt(countResult.rows[0].count, 10) };
}

export interface AdminAttendanceFilters {
  employeeId?: string;
  from?: string;
  to?: string;
  status?: "checked_in" | "checked_out";
  page: number;
  limit: number;
}

export async function listAllAttendance(
  filters: AdminAttendanceFilters
): Promise<{ items: any[]; total: number }> {
  const conditions: string[] = [];
  const values: any[] = [];

  if (filters.employeeId) {
    values.push(filters.employeeId);
    conditions.push(`a.employee_id = $${values.length}`);
  }
  if (filters.from) {
    values.push(filters.from);
    conditions.push(`a.attendance_date >= $${values.length}`);
  }
  if (filters.to) {
    values.push(filters.to);
    conditions.push(`a.attendance_date <= $${values.length}`);
  }
  if (filters.status) {
    values.push(filters.status);
    conditions.push(`a.status = $${values.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) FROM attendance a ${whereClause}`,
    values
  );

  const offset = (filters.page - 1) * filters.limit;
  values.push(filters.limit, offset);

  const itemsResult = await pool.query(
    `SELECT ${ADMIN_LIST_SELECT}
     FROM attendance a
     JOIN employees e ON e.id = a.employee_id
     LEFT JOIN sites s ON s.id = a.site_id
     ${whereClause}
     ORDER BY a.attendance_date DESC, a.check_in_time DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );

  return { items: itemsResult.rows, total: parseInt(countResult.rows[0].count, 10) };
}

/** Rich attendance rows within a date range, used for the monthly grid + export. */
export async function listAttendanceInRange(
  from: string,
  to: string,
  employeeId?: string,
  siteId?: string
): Promise<any[]> {
  const conditions: string[] = ["a.attendance_date >= $1", "a.attendance_date <= $2"];
  const values: any[] = [from, to];

  if (employeeId) {
    values.push(employeeId);
    conditions.push(`a.employee_id = $${values.length}`);
  }
  if (siteId) {
    values.push(siteId);
    conditions.push(`a.site_id = $${values.length}`);
  }

  const result = await pool.query(
    `SELECT
       a.*,
       a.attendance_date::text AS attendance_date,
       e.employee_code, e.name AS employee_name,
       s.name AS site_name
     FROM attendance a
     JOIN employees e ON e.id = a.employee_id
     LEFT JOIN sites s ON s.id = a.site_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY a.attendance_date ASC, e.name ASC`,
    values
  );
  return result.rows;
}

/** Approved leaves within a date range, keyed later by employee + date. */
export async function listApprovedLeavesInRange(
  from: string,
  to: string,
  employeeId?: string
): Promise<{ employee_id: string; leave_date: string; leave_type: string }[]> {
  const conditions: string[] = ["status = 'approved'", "leave_date >= $1", "leave_date <= $2"];
  const values: any[] = [from, to];

  if (employeeId) {
    values.push(employeeId);
    conditions.push(`employee_id = $${values.length}`);
  }

  const result = await pool.query<{ employee_id: string; leave_date: string; leave_type: string }>(
    `SELECT employee_id, leave_date::text AS leave_date, leave_type
       FROM leave_requests
      WHERE ${conditions.join(" AND ")}`,
    values
  );
  return result.rows;
}

export async function findAttendanceWithEmployeeById(id: string): Promise<any | null> {
  const result = await pool.query(
    `SELECT ${ADMIN_LIST_SELECT}
     FROM attendance a
     JOIN employees e ON e.id = a.employee_id
     LEFT JOIN sites s ON s.id = a.site_id
     WHERE a.id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function getDashboardSummary(today: string, lateCutoff: string) {
  const totalEmployeesResult = await pool.query<{ count: string }>(
    "SELECT COUNT(*) FROM employees WHERE role = 'employee' AND is_active = true"
  );

  const todayStatsResult = await pool.query<{
    present: string;
    half_day: string;
    absent_marked: string;
    attended: string;
    checked_in: string;
    checked_out: string;
    late: string;
  }>(
    `SELECT
       COUNT(*) FILTER (WHERE day_status = 'present') AS present,
       COUNT(*) FILTER (WHERE day_status = 'half_day') AS half_day,
       COUNT(*) FILTER (WHERE day_status = 'absent') AS absent_marked,
       -- attended = showed up and not classified absent (includes those still checked in)
       COUNT(*) FILTER (WHERE status = 'checked_in' OR day_status IN ('present', 'half_day')) AS attended,
       COUNT(*) FILTER (WHERE status = 'checked_in') AS checked_in,
       COUNT(*) FILTER (WHERE status = 'checked_out') AS checked_out,
       COUNT(*) FILTER (
         WHERE status <> 'absent'
           AND is_admin_marked = false
           AND check_in_time::time > $2::time
       ) AS late
     FROM attendance
     WHERE attendance_date = $1`,
    [today, lateCutoff]
  );

  const totalEmployees = parseInt(totalEmployeesResult.rows[0].count, 10);
  const stats = todayStatsResult.rows[0];
  const attended = parseInt(stats?.attended ?? "0", 10);
  const halfDay = parseInt(stats?.half_day ?? "0", 10);

  return {
    totalEmployees,
    presentToday: attended,
    halfDayToday: halfDay,
    absentToday: Math.max(0, totalEmployees - attended),
    lateArrivals: parseInt(stats?.late ?? "0", 10),
    currentlyCheckedIn: parseInt(stats?.checked_in ?? "0", 10),
    checkedOutToday: parseInt(stats?.checked_out ?? "0", 10),
  };
}

export async function listTodayAttendanceWithEmployees(today: string) {
  const result = await pool.query(
    `SELECT ${ADMIN_LIST_SELECT}
     FROM attendance a
     JOIN employees e ON e.id = a.employee_id
     LEFT JOIN sites s ON s.id = a.site_id
     WHERE a.attendance_date = $1
     ORDER BY a.check_in_time ASC`,
    [today]
  );
  return result.rows;
}

/**
 * Marks an employee Present for the day. Upserts on (employee_id,
 * attendance_date) so an admin can explicitly override a previously recorded
 * status (e.g. flip an Absent record to Present) instead of being blocked.
 */
export async function adminMarkPresent(input: {
  employeeId: string;
  date: string;
  adminId: string;
  reason: string | null;
  totalMinutes: number;
}): Promise<AttendanceRecord> {
  const now = new Date();
  const mins = input.totalMinutes;
  const result = await pool.query<AttendanceRecord>(
    `INSERT INTO attendance (
       employee_id, attendance_date,
       check_in_time, check_out_time,
       check_in_status, is_half_day, check_out_status,
       total_minutes, status, day_status,
       is_admin_marked, admin_marked_by, admin_mark_reason
     ) VALUES ($1, $2, $3, $3, 'on_time', false, NULL, $6, 'checked_out', 'present', true, $4, $5)
     ON CONFLICT (employee_id, attendance_date) DO UPDATE SET
       check_in_time     = EXCLUDED.check_in_time,
       check_out_time    = EXCLUDED.check_out_time,
       check_in_status   = 'on_time',
       is_half_day       = false,
       check_out_status  = NULL,
       total_minutes     = $6,
       status            = 'checked_out',
       day_status        = 'present',
       is_admin_marked   = true,
       admin_marked_by   = EXCLUDED.admin_marked_by,
       admin_mark_reason = EXCLUDED.admin_mark_reason
     RETURNING *`,
    [input.employeeId, input.date, now, input.adminId, input.reason, mins]
  );
  return result.rows[0];
}

/**
 * Marks an employee Absent for the day. Upserts on (employee_id,
 * attendance_date) and clears any prior check-in/out detail so the record is a
 * clean absent entry, allowing the admin to explicitly override an earlier
 * Present status.
 */
export async function adminMarkAbsent(input: {
  employeeId: string;
  date: string;
  adminId: string;
  reason: string | null;
}): Promise<AttendanceRecord> {
  const result = await pool.query<AttendanceRecord>(
    `INSERT INTO attendance (
       employee_id, attendance_date,
       status, day_status, is_admin_marked, admin_marked_by, admin_mark_reason
     ) VALUES ($1, $2, 'absent', 'absent', true, $3, $4)
     ON CONFLICT (employee_id, attendance_date) DO UPDATE SET
       status               = 'absent',
       day_status           = 'absent',
       check_in_time        = NULL,
       check_in_latitude    = NULL,
       check_in_longitude   = NULL,
       check_in_address     = NULL,
       check_in_selfie_path = NULL,
       check_in_device_info = NULL,
       check_out_time       = NULL,
       check_out_latitude   = NULL,
       check_out_longitude  = NULL,
       check_out_address    = NULL,
       site_id              = NULL,
       work_summary         = NULL,
       work_status          = NULL,
       remarks              = NULL,
       site_photo_paths     = '[]',
       total_minutes        = NULL,
       check_in_status      = NULL,
       is_half_day          = false,
       check_out_status     = NULL,
       is_admin_marked      = true,
       admin_marked_by      = EXCLUDED.admin_marked_by,
       admin_mark_reason    = EXCLUDED.admin_mark_reason
     RETURNING *`,
    [input.employeeId, input.date, input.adminId, input.reason]
  );
  return result.rows[0];
}
