import { pool } from "../../config/db";

export interface DashboardSummaryResult {
  totalEmployees: number;
  presentToday: number;
  halfDayToday: number;
  absentToday: number;
  lateArrivals: number;
  currentlyCheckedIn: number;
  checkedOutToday: number;
}

/**
 * Classifies an active employee's attendance for a single day.
 * Each employee falls into exactly one of: present, half_day, or absent buckets.
 */
export function classifyEmployeeDayBucket(record: {
  status: string | null;
  day_status: string | null;
  check_in_status: string | null;
  is_half_day: boolean | null;
} | null): "present" | "half_day" | "absent" {
  if (!record) return "absent";

  const status = record.status;
  const dayStatus = record.day_status;
  const checkInStatus = record.check_in_status;
  const isHalfDay = Boolean(record.is_half_day);

  if (status === "absent" || dayStatus === "absent") {
    return "absent";
  }

  if (dayStatus === "half_day") {
    return "half_day";
  }

  if (dayStatus === "present") {
    return "present";
  }

  if (status === "checked_in" && dayStatus == null) {
    if (isHalfDay || checkInStatus === "half_day") {
      return "half_day";
    }
    return "present";
  }

  // Checked out without a resolved day status — treat as absent (insufficient / incomplete).
  return "absent";
}

export function isLateArrival(record: {
  status: string | null;
  check_in_status: string | null;
  is_admin_marked: boolean | null;
  check_in_time: Date | string | null;
} | null): boolean {
  if (!record?.check_in_time) return false;
  if (record.status === "absent") return false;
  if (record.is_admin_marked) return false;
  return record.check_in_status === "late";
}

export async function getDashboardSummary(today: string): Promise<DashboardSummaryResult> {
  const result = await pool.query<{
    total_employees: string;
    present_today: string;
    half_day_today: string;
    absent_today: string;
    late_arrivals: string;
    checked_in: string;
    checked_out: string;
  }>(
    `WITH active_employees AS (
       SELECT id
         FROM employees
        WHERE role = 'employee'
          AND is_active = true
          AND deleted_at IS NULL
     ),
     today_attendance AS (
       SELECT a.*
         FROM attendance a
         INNER JOIN active_employees e ON e.id = a.employee_id
        WHERE a.attendance_date = $1
     ),
     classified AS (
       SELECT
         e.id AS employee_id,
         a.status,
         a.day_status,
         a.check_in_status,
         a.is_half_day,
         a.is_admin_marked,
         a.check_in_time,
         CASE
           WHEN a.id IS NULL THEN 'absent'
           WHEN a.status = 'absent' OR a.day_status = 'absent' THEN 'absent'
           WHEN a.day_status = 'half_day' THEN 'half_day'
           WHEN a.day_status = 'present' THEN 'present'
           WHEN a.status = 'checked_in'
             AND a.day_status IS NULL
             AND (a.is_half_day OR a.check_in_status = 'half_day') THEN 'half_day'
           WHEN a.status = 'checked_in' AND a.day_status IS NULL THEN 'present'
           ELSE 'absent'
         END AS day_bucket
       FROM active_employees e
       LEFT JOIN today_attendance a ON a.employee_id = e.id
     )
     SELECT
       (SELECT COUNT(*) FROM active_employees) AS total_employees,
       COUNT(*) FILTER (WHERE day_bucket = 'present') AS present_today,
       COUNT(*) FILTER (WHERE day_bucket = 'half_day') AS half_day_today,
       COUNT(*) FILTER (WHERE day_bucket = 'absent') AS absent_today,
       (
         SELECT COUNT(*)
           FROM today_attendance a
          WHERE a.check_in_status = 'late'
            AND COALESCE(a.is_admin_marked, false) = false
            AND a.status <> 'absent'
       ) AS late_arrivals,
       (
         SELECT COUNT(*)
           FROM today_attendance a
          WHERE a.status = 'checked_in'
       ) AS checked_in,
       (
         SELECT COUNT(*)
           FROM today_attendance a
          WHERE a.status = 'checked_out'
       ) AS checked_out
     FROM classified`,
    [today]
  );

  const row = result.rows[0];
  return {
    totalEmployees: parseInt(row?.total_employees ?? "0", 10),
    presentToday: parseInt(row?.present_today ?? "0", 10),
    halfDayToday: parseInt(row?.half_day_today ?? "0", 10),
    absentToday: parseInt(row?.absent_today ?? "0", 10),
    lateArrivals: parseInt(row?.late_arrivals ?? "0", 10),
    currentlyCheckedIn: parseInt(row?.checked_in ?? "0", 10),
    checkedOutToday: parseInt(row?.checked_out ?? "0", 10),
  };
}

export async function listTodayAttendanceWithEmployees(today: string) {
  const result = await pool.query(
    `SELECT
       a.*,
       e.employee_code, e.name AS employee_name,
       s.name AS site_name
     FROM attendance a
     JOIN employees e ON e.id = a.employee_id
     LEFT JOIN sites s ON s.id = a.site_id
     WHERE a.attendance_date = $1
       AND e.role = 'employee'
       AND e.is_active = true
       AND e.deleted_at IS NULL
     ORDER BY COALESCE(a.check_out_time, a.check_in_time) DESC NULLS LAST, e.name ASC`,
    [today]
  );
  return result.rows;
}
