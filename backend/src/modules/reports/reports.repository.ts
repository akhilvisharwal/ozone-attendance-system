import { pool } from "../../config/db";
import { ReportRow } from "./reports.service";

export async function fetchReportRows(filters: {
  from: string;
  to: string;
  employeeId?: string;
}): Promise<ReportRow[]> {
  const conditions: string[] = ["a.attendance_date BETWEEN $1 AND $2"];
  const values: any[] = [filters.from, filters.to];

  if (filters.employeeId) {
    values.push(filters.employeeId);
    conditions.push(`a.employee_id = $${values.length}`);
  }

  const result = await pool.query<ReportRow>(
    `SELECT
       e.employee_code, e.name AS employee_name,
       a.attendance_date::text AS attendance_date,
       a.check_in_time, a.check_out_time, a.total_minutes, a.day_status,
       s.name AS site_name, a.work_status, a.work_summary,
       a.check_in_address, a.remarks
     FROM attendance a
     JOIN employees e ON e.id = a.employee_id
     LEFT JOIN sites s ON s.id = a.site_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY a.attendance_date DESC, e.employee_code ASC`,
    values
  );

  return result.rows;
}
