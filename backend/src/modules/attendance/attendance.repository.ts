import type { PoolClient } from "pg";
import { pool } from "../../config/db";
import { AttendanceRecord, CheckInStatus, CheckOutStatus, DayStatus, SpecialDayStatus, WorkStatus } from "../../types";
import type { ManualAttendanceInput } from "./manualAttendance.types";
import { combineDateAndTime, minutesBetweenTimes } from "./manualAttendance.types";

type Queryable = Pick<typeof pool, "query"> | PoolClient;

const ADMIN_LIST_SELECT = `
  a.*,
  e.employee_code, e.name AS employee_name, e.profile_photo_path AS employee_profile_photo_path,
  d.name AS employee_designation,
  s.name AS site_name,
  marker.name AS admin_marked_by_name,
  approver.name AS admin_approved_by_name
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
  specialDayStatus?: SpecialDayStatus | null;
}): Promise<AttendanceRecord> {
  const result = await pool.query<AttendanceRecord>(
    `INSERT INTO attendance (
       employee_id, attendance_date, check_in_time,
       check_in_latitude, check_in_longitude, check_in_address,
       check_in_selfie_path, check_in_device_info,
       check_in_status, is_half_day, status,
       site_id, work_summary, work_status, special_day_status
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'checked_in', $11, $12, $13, $14)
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
      input.specialDayStatus ?? null,
    ]
  );
  return result.rows[0];
}

export async function reopenForCheckIn(input: {
  id: string;
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
    `UPDATE attendance SET
       check_in_time = $1,
       check_in_latitude = $2,
       check_in_longitude = $3,
       check_in_address = $4,
       check_in_selfie_path = $5,
       check_in_device_info = $6,
       check_in_status = $7,
       is_half_day = $8,
       site_id = $9,
       work_summary = COALESCE($10, work_summary),
       work_status = COALESCE($11, work_status),
       check_out_time = NULL,
       check_out_latitude = NULL,
       check_out_longitude = NULL,
       check_out_address = NULL,
       check_out_gps_accuracy = NULL,
       check_out_status = NULL,
       day_status = NULL,
       site_photo_paths = '{}',
       remarks = NULL,
       status = 'checked_in',
       is_admin_marked = false
     WHERE id = $12
     RETURNING *`,
    [
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
      input.id,
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
  gpsAccuracy: number | null;
  workSummary: string | null;
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
       check_out_gps_accuracy = $5,
       work_summary = $6,
       work_status = $7,
       remarks = $8,
       site_photo_paths = $9,
       total_minutes = $10,
       check_out_status = $11,
       day_status = $12,
       is_half_day = $13,
       status = 'checked_out'
     WHERE id = $14
     RETURNING *`,
    [
      input.checkOutTime,
      input.latitude,
      input.longitude,
      input.address,
      input.gpsAccuracy,
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
  status?: "present" | "half_day" | "absent" | "pending" | "checked_in" | "checked_out";
  sort?: "oldest" | "newest";
  page: number;
  limit: number;
}

function appendAdminAttendanceStatusFilter(
  status: AdminAttendanceFilters["status"],
  conditions: string[]
): void {
  if (!status) return;

  switch (status) {
    case "present":
      conditions.push(`a.day_status = 'present'`);
      break;
    case "half_day":
      conditions.push(`a.day_status = 'half_day'`);
      break;
    case "absent":
      conditions.push(`(a.status = 'absent' OR a.day_status = 'absent')`);
      break;
    case "pending":
      conditions.push(`a.status = 'checked_in' AND a.day_status IS NULL`);
      break;
    case "checked_in":
      conditions.push(`a.status = 'checked_in'`);
      break;
    case "checked_out":
      conditions.push(`a.status = 'checked_out'`);
      break;
  }
}

function buildAdminAttendanceWhereClause(filters: AdminAttendanceFilters): {
  whereClause: string;
  values: unknown[];
} {
  const conditions: string[] = ["e.deleted_at IS NULL"];
  const values: unknown[] = [];

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
  appendAdminAttendanceStatusFilter(filters.status, conditions);

  return {
    whereClause: `WHERE ${conditions.join(" AND ")}`,
    values,
  };
}

export async function listAllAttendance(
  filters: AdminAttendanceFilters
): Promise<{ items: any[]; total: number }> {
  const { whereClause, values } = buildAdminAttendanceWhereClause(filters);

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM attendance a
     JOIN employees e ON e.id = a.employee_id
     ${whereClause}`,
    values
  );

  const listValues = [...values, filters.limit, (filters.page - 1) * filters.limit];
  const limitParam = listValues.length - 1;
  const offsetParam = listValues.length;
  const orderBy =
    filters.sort === "newest"
      ? "ORDER BY a.attendance_date DESC, a.check_in_time DESC NULLS LAST"
      : "ORDER BY a.attendance_date ASC, a.check_in_time ASC NULLS LAST";

  const itemsResult = await pool.query(
    `SELECT ${ADMIN_LIST_SELECT}
     FROM attendance a
     JOIN employees e ON e.id = a.employee_id
     LEFT JOIN employee_designations d ON d.id = e.designation_id
     LEFT JOIN sites s ON s.id = a.site_id
     LEFT JOIN employees marker ON marker.id = a.admin_marked_by
     LEFT JOIN employees approver ON approver.id = a.admin_approved_by
     ${whereClause}
     ${orderBy}
     LIMIT $${limitParam} OFFSET $${offsetParam}`,
    listValues
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
     ORDER BY a.attendance_date ASC, e.created_at ASC, e.employee_code ASC`,
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
     LEFT JOIN employee_designations d ON d.id = e.designation_id
     LEFT JOIN sites s ON s.id = a.site_id
     LEFT JOIN employees marker ON marker.id = a.admin_marked_by
     LEFT JOIN employees approver ON approver.id = a.admin_approved_by
     WHERE a.id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function findAttendanceWithEmployeeByDate(
  employeeId: string,
  date: string
): Promise<any | null> {
  const result = await pool.query(
    `SELECT ${ADMIN_LIST_SELECT}
     FROM attendance a
     JOIN employees e ON e.id = a.employee_id
     LEFT JOIN employee_designations d ON d.id = e.designation_id
     LEFT JOIN sites s ON s.id = a.site_id
     LEFT JOIN employees marker ON marker.id = a.admin_marked_by
     LEFT JOIN employees approver ON approver.id = a.admin_approved_by
     WHERE a.employee_id = $1 AND a.attendance_date = $2`,
    [employeeId, date]
  );
  return result.rows[0] ?? null;
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
 * Marks an employee Half Day for the day. Upserts on (employee_id,
 * attendance_date) so an admin can override a previously recorded status.
 */
export async function adminMarkHalfDay(input: {
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
     ) VALUES ($1, $2, $3, $3, 'half_day', true, NULL, $6, 'checked_out', 'half_day', true, $4, $5)
     ON CONFLICT (employee_id, attendance_date) DO UPDATE SET
       check_in_time     = EXCLUDED.check_in_time,
       check_out_time    = EXCLUDED.check_out_time,
       check_in_status   = 'half_day',
       is_half_day       = true,
       check_out_status  = NULL,
       total_minutes     = $6,
       status            = 'checked_out',
       day_status        = 'half_day',
       is_admin_marked   = true,
       admin_marked_by   = EXCLUDED.admin_marked_by,
       admin_mark_reason = EXCLUDED.admin_mark_reason
     RETURNING *`,
    [input.employeeId, input.date, now, input.adminId, input.reason, mins]
  );
  return result.rows[0];
}

/** Inserts absent records for employees with no attendance row that day. Skips conflicts. */
export async function insertAutoAbsentRecords(
  employeeIds: string[],
  date: string
): Promise<number> {
  if (employeeIds.length === 0) return 0;

  const result = await pool.query(
    `INSERT INTO attendance (
       employee_id, attendance_date,
       status, day_status, is_admin_marked, admin_mark_reason
     )
     SELECT unnest($1::uuid[]), $2, 'absent', 'absent', false, 'Auto-marked absent at end of day'
     ON CONFLICT (employee_id, attendance_date) DO NOTHING`,
    [employeeIds, date]
  );
  return result.rowCount ?? 0;
}

/** Finalizes an open check-in at closing time with automatic day_status. */
export async function finalizeAttendanceAtClosing(input: {
  id: string;
  checkOutTime: Date;
  totalMinutes: number;
  dayStatus: DayStatus;
  reason?: string;
}): Promise<AttendanceRecord | null> {
  const result = await pool.query<AttendanceRecord>(
    `UPDATE attendance SET
       check_out_time = COALESCE(check_out_time, $1),
       total_minutes = $2,
       day_status = $3,
       is_half_day = $4,
       status = 'checked_out',
       admin_mark_reason = COALESCE(admin_mark_reason, $5)
     WHERE id = $6
       AND NOT is_admin_marked
       AND status = 'checked_in'
     RETURNING *`,
    [
      input.checkOutTime,
      input.totalMinutes,
      input.dayStatus,
      input.dayStatus === "half_day",
      input.reason ?? "Auto-finalized at end of day",
      input.id,
    ]
  );
  return result.rows[0] ?? null;
}

/** Applies automatic day_status to checked-out rows missing day_status. */
export async function applyAutomaticDayStatus(input: {
  id: string;
  dayStatus: DayStatus;
}): Promise<boolean> {
  const result = await pool.query(
    `UPDATE attendance SET
       day_status = $1,
       is_half_day = $2
     WHERE id = $3
       AND NOT is_admin_marked
       AND day_status IS NULL`,
    [input.dayStatus, input.dayStatus === "half_day", input.id]
  );
  return (result.rowCount ?? 0) > 0;
}

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
       check_out_gps_accuracy = NULL,
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

function buildManualAttendanceFields(input: ManualAttendanceInput): {
  checkInTime: Date | null;
  checkOutTime: Date | null;
  totalMinutes: number | null;
  status: AttendanceRecord["status"];
  dayStatus: DayStatus | null;
  checkInStatus: CheckInStatus | null;
  isHalfDay: boolean;
  checkOutStatus: CheckOutStatus | null;
  specialDayStatus: "holiday_worked" | "weekly_off_worked" | null;
} {
  const { status, date, checkInTime, checkOutTime, totalMinutes } = input;

  if (
    status === "present" ||
    status === "half_day" ||
    status === "holiday_worked" ||
    status === "weekly_off_worked"
  ) {
    const checkIn = checkInTime ? combineDateAndTime(date, checkInTime) : null;
    const checkOut = checkOutTime ? combineDateAndTime(date, checkOutTime) : null;
    const mins =
      totalMinutes ??
      (checkInTime && checkOutTime ? minutesBetweenTimes(date, checkInTime, checkOutTime) : null);

    const dayStatus: DayStatus =
      status === "half_day" ? "half_day" : "present";
    const specialDayStatus =
      status === "holiday_worked"
        ? "holiday_worked"
        : status === "weekly_off_worked"
          ? "weekly_off_worked"
          : null;

    return {
      checkInTime: checkIn,
      checkOutTime: checkOut,
      totalMinutes: mins,
      status: "checked_out",
      dayStatus,
      checkInStatus: status === "half_day" ? "half_day" : "on_time",
      isHalfDay: status === "half_day",
      checkOutStatus: null,
      specialDayStatus,
    };
  }

  if (status === "absent") {
    return {
      checkInTime: null,
      checkOutTime: null,
      totalMinutes: null,
      status: "absent",
      dayStatus: "absent",
      checkInStatus: null,
      isHalfDay: false,
      checkOutStatus: null,
      specialDayStatus: null,
    };
  }

  // leave | holiday | weekly_off | not_applicable
  return {
    checkInTime: null,
    checkOutTime: null,
    totalMinutes: null,
    status: "checked_out",
    dayStatus: null,
    checkInStatus: null,
    isHalfDay: false,
    checkOutStatus: null,
    specialDayStatus: null,
  };
}

/** Upserts a fully manual attendance record that overrides automatic calculations for the date. */
export async function upsertManualAttendance(
  input: ManualAttendanceInput,
  db: Queryable = pool
): Promise<AttendanceRecord> {
  const fields = buildManualAttendanceFields(input);

  const result = await db.query<AttendanceRecord>(
    `INSERT INTO attendance (
       employee_id, attendance_date,
       check_in_time, check_out_time,
       check_in_status, is_half_day, check_out_status,
       total_minutes, status, day_status,
       is_admin_marked, admin_marked_by, admin_mark_reason,
       admin_mark_status, admin_approved_by,
       special_day_status,
       check_in_latitude, check_in_longitude, check_in_address, check_in_selfie_path, check_in_device_info,
       check_out_latitude, check_out_longitude, check_out_address, check_out_gps_accuracy,
       site_id, work_summary, work_status, remarks, site_photo_paths
     ) VALUES (
       $1, $2,
       $3, $4,
       $5, $6, $7,
       $8, $9, $10,
       true, $11, $12,
       $13, $14,
       $15,
       NULL, NULL, NULL, NULL, NULL,
       NULL, NULL, NULL, NULL,
       NULL, NULL, NULL, NULL, '[]'
     )
     ON CONFLICT (employee_id, attendance_date) DO UPDATE SET
       check_in_time        = EXCLUDED.check_in_time,
       check_out_time       = EXCLUDED.check_out_time,
       check_in_status      = EXCLUDED.check_in_status,
       is_half_day          = EXCLUDED.is_half_day,
       check_out_status     = EXCLUDED.check_out_status,
       total_minutes        = EXCLUDED.total_minutes,
       status               = EXCLUDED.status,
       day_status           = EXCLUDED.day_status,
       is_admin_marked      = true,
       admin_marked_by      = EXCLUDED.admin_marked_by,
       admin_mark_reason    = EXCLUDED.admin_mark_reason,
       admin_mark_status    = EXCLUDED.admin_mark_status,
       admin_approved_by    = EXCLUDED.admin_approved_by,
       special_day_status   = EXCLUDED.special_day_status,
       check_in_latitude    = NULL,
       check_in_longitude   = NULL,
       check_in_address     = NULL,
       check_in_selfie_path = NULL,
       check_in_device_info = NULL,
       check_out_latitude   = NULL,
       check_out_longitude  = NULL,
       check_out_address    = NULL,
       check_out_gps_accuracy = NULL,
       site_id              = NULL,
       work_summary         = NULL,
       work_status          = NULL,
       remarks              = NULL,
       site_photo_paths     = '[]',
       updated_at           = now()
     RETURNING *`,
    [
      input.employeeId,
      input.date,
      fields.checkInTime,
      fields.checkOutTime,
      fields.checkInStatus,
      fields.isHalfDay,
      fields.checkOutStatus,
      fields.totalMinutes,
      fields.status,
      fields.dayStatus,
      input.adminId,
      input.reason,
      input.status,
      input.approvedById,
      fields.specialDayStatus,
    ]
  );
  return result.rows[0];
}

/** Active employee IDs that exist for bulk manual attendance. */
export async function listValidEmployeeIdsForManualAttendance(
  employeeIds: string[]
): Promise<string[]> {
  if (employeeIds.length === 0) return [];
  const result = await pool.query<{ id: string }>(
    `SELECT id
       FROM employees
      WHERE id = ANY($1::uuid[])
        AND role = 'employee'
        AND deleted_at IS NULL
        AND is_active = true`,
    [employeeIds]
  );
  return result.rows.map((row) => row.id);
}

export async function deleteManualAttendance(employeeId: string, date: string): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM attendance
      WHERE employee_id = $1
        AND attendance_date = $2
        AND is_admin_marked = true`,
    [employeeId, date]
  );
  return (result.rowCount ?? 0) > 0;
}
