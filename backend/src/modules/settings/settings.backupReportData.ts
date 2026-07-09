import { pool } from "../../config/db";
import { getCompanyName } from "../../config/branding";
import { getSettings } from "./settings.cache";
import { formatDisplayDateTime } from "../../utils/formatDisplay";
import { formatMinutesAsHours } from "../../utils/date";
import type {
  ReadableReportBundle,
  ReadableReportScope,
  ReportColumn,
  ReportSection,
  ReportSectionId,
} from "./settings.backupReport.types";
import { REPORT_SECTION_ORDER } from "./settings.backupReport.types";

const SENSITIVE_SETTING_KEYS = new Set(["defaultPassword"]);

function cell(value: unknown): string {
  if (value == null || value === "") return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value instanceof Date) return formatDisplayDateTime(value);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function section(
  id: ReportSectionId,
  title: string,
  columns: ReportColumn[],
  rows: Record<string, string>[]
): ReportSection {
  return { id, title, columns, rows, recordCount: rows.length };
}

async function fetchEmployeesSection(): Promise<ReportSection> {
  const columns: ReportColumn[] = [
    { key: "employee_code", label: "Employee ID", width: 72 },
    { key: "name", label: "Name", width: 120 },
    { key: "email", label: "Email", width: 140 },
    { key: "phone", label: "Phone", width: 90 },
    { key: "department", label: "Department", width: 90 },
    { key: "role", label: "Role", width: 70 },
    { key: "is_active", label: "Active", width: 50 },
    { key: "created_at", label: "Created", width: 100 },
  ];

  const res = await pool.query(
    `SELECT employee_code, name, email, phone, department, role, is_active, created_at
       FROM employees
      WHERE deleted_at IS NULL
      ORDER BY employee_code ASC`
  );

  const rows = res.rows.map((row) => ({
    employee_code: cell(row.employee_code),
    name: cell(row.name),
    email: cell(row.email),
    phone: cell(row.phone),
    department: cell(row.department),
    role: cell(row.role),
    is_active: cell(row.is_active),
    created_at: cell(row.created_at),
  }));

  return section("employees", "Employees", columns, rows);
}

async function fetchAttendanceSection(): Promise<ReportSection> {
  const columns: ReportColumn[] = [
    { key: "employee_code", label: "Employee ID", width: 72 },
    { key: "employee_name", label: "Name", width: 110 },
    { key: "attendance_date", label: "Date", width: 72 },
    { key: "check_in_time", label: "Check-in", width: 95 },
    { key: "check_out_time", label: "Check-out", width: 95 },
    { key: "working_hours", label: "Hours", width: 55 },
    { key: "status", label: "Status", width: 70 },
    { key: "site_name", label: "Site", width: 90 },
    { key: "work_status", label: "Work Status", width: 80 },
    { key: "remarks", label: "Remarks", width: 120 },
  ];

  const res = await pool.query(
    `SELECT e.employee_code,
            e.name AS employee_name,
            a.attendance_date,
            a.check_in_time,
            a.check_out_time,
            a.total_minutes,
            a.status,
            s.name AS site_name,
            a.work_status,
            COALESCE(a.remarks, a.work_summary) AS remarks
       FROM attendance a
       JOIN employees e ON e.id = a.employee_id
       LEFT JOIN sites s ON s.id = a.site_id
      ORDER BY a.attendance_date DESC, e.employee_code ASC`
  );

  const rows = res.rows.map((row) => ({
    employee_code: cell(row.employee_code),
    employee_name: cell(row.employee_name),
    attendance_date: cell(row.attendance_date),
    check_in_time: cell(row.check_in_time),
    check_out_time: cell(row.check_out_time),
    working_hours: formatMinutesAsHours(row.total_minutes),
    status: cell(row.status),
    site_name: cell(row.site_name),
    work_status: cell(row.work_status),
    remarks: cell(row.remarks),
  }));

  return section("attendance", "Attendance", columns, rows);
}

async function fetchLeaveSection(): Promise<ReportSection> {
  const columns: ReportColumn[] = [
    { key: "employee_code", label: "Employee ID", width: 72 },
    { key: "employee_name", label: "Name", width: 110 },
    { key: "leave_date", label: "Leave Date", width: 72 },
    { key: "leave_category", label: "Category", width: 80 },
    { key: "leave_type", label: "Duration", width: 60 },
    { key: "status", label: "Status", width: 70 },
    { key: "reason", label: "Reason", width: 140 },
    { key: "reviewed_at", label: "Reviewed", width: 95 },
  ];

  const res = await pool.query(
    `SELECT e.employee_code,
            e.name AS employee_name,
            l.leave_date,
            l.leave_category,
            l.leave_type,
            l.status,
            l.reason,
            l.reviewed_at
       FROM leave_requests l
       JOIN employees e ON e.id = l.employee_id
      ORDER BY l.leave_date DESC, e.employee_code ASC`
  );

  const rows = res.rows.map((row) => ({
    employee_code: cell(row.employee_code),
    employee_name: cell(row.employee_name),
    leave_date: cell(row.leave_date),
    leave_category: cell(row.leave_category),
    leave_type: cell(row.leave_type),
    status: cell(row.status),
    reason: cell(row.reason),
    reviewed_at: cell(row.reviewed_at),
  }));

  return section("leave", "Leave", columns, rows);
}

async function fetchHolidaysSection(): Promise<ReportSection> {
  const columns: ReportColumn[] = [
    { key: "name", label: "Holiday", width: 140 },
    { key: "holiday_type", label: "Type", width: 80 },
    { key: "holiday_date", label: "Date", width: 72 },
    { key: "recurring_pattern", label: "Recurring", width: 90 },
    { key: "description", label: "Description", width: 180 },
  ];

  const res = await pool.query(
    `SELECT name,
            holiday_type,
            holiday_date,
            recurring_month,
            recurring_day,
            description
       FROM company_holidays
      ORDER BY COALESCE(holiday_date, make_date(2000, recurring_month, recurring_day)), name ASC`
  );

  const rows = res.rows.map((row) => {
    const recurring =
      row.holiday_type === "recurring" && row.recurring_month && row.recurring_day
        ? `${String(row.recurring_month).padStart(2, "0")}/${String(row.recurring_day).padStart(2, "0")}`
        : "-";
    return {
      name: cell(row.name),
      holiday_type: cell(row.holiday_type),
      holiday_date: cell(row.holiday_date),
      recurring_pattern: recurring,
      description: cell(row.description),
    };
  });

  return section("holidays", "Holidays", columns, rows);
}

function flattenSettings(settings: ReturnType<typeof getSettings>): ReportSection {
  const columns: ReportColumn[] = [
    { key: "category", label: "Category", width: 90 },
    { key: "setting", label: "Setting", width: 140 },
    { key: "value", label: "Value", width: 220 },
  ];

  const rows: Record<string, string>[] = [];
  for (const [category, value] of Object.entries(settings)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      const display = SENSITIVE_SETTING_KEYS.has(key) ? "[Protected]" : cell(raw);
      rows.push({
        category: cell(category),
        setting: cell(key),
        value: display,
      });
    }
  }

  rows.sort((a, b) => a.category.localeCompare(b.category) || a.setting.localeCompare(b.setting));
  return section("settings", "Settings", columns, rows);
}

async function fetchAuditSection(): Promise<ReportSection> {
  const columns: ReportColumn[] = [
    { key: "created_at", label: "Timestamp", width: 100 },
    { key: "actor", label: "Actor", width: 110 },
    { key: "action", label: "Action", width: 120 },
    { key: "target_type", label: "Target Type", width: 80 },
    { key: "target_id", label: "Target ID", width: 100 },
    { key: "ip_address", label: "IP Address", width: 90 },
  ];

  const res = await pool.query(
    `SELECT a.created_at,
            COALESCE(e.name, 'System') AS actor_name,
            COALESCE(e.employee_code, '-') AS actor_code,
            a.action,
            a.target_type,
            a.target_id,
            a.ip_address
       FROM audit_logs a
       LEFT JOIN employees e ON e.id = a.actor_id
      ORDER BY a.created_at DESC
      LIMIT 5000`
  );

  const rows = res.rows.map((row) => ({
    created_at: cell(row.created_at),
    actor:
      row.actor_code && row.actor_code !== "-"
        ? `${row.actor_name} (${row.actor_code})`
        : cell(row.actor_name),
    action: cell(row.action),
    target_type: cell(row.target_type),
    target_id: cell(row.target_id),
    ip_address: cell(row.ip_address),
  }));

  return section("audit", "Audit Logs", columns, rows);
}

const SECTION_FETCHERS: Record<ReportSectionId, () => Promise<ReportSection> | ReportSection> = {
  employees: fetchEmployeesSection,
  attendance: fetchAttendanceSection,
  leave: fetchLeaveSection,
  holidays: fetchHolidaysSection,
  settings: () => flattenSettings(getSettings()),
  audit: fetchAuditSection,
};

function sectionsForScope(scope: ReadableReportScope): ReportSectionId[] {
  if (scope === "employees") return ["employees"];
  if (scope === "attendance") return ["attendance"];
  return [...REPORT_SECTION_ORDER];
}

export async function fetchReadableReportBundle(scope: ReadableReportScope): Promise<ReadableReportBundle> {
  const sectionIds = sectionsForScope(scope);
  const sections: ReportSection[] = [];
  for (const id of sectionIds) {
    sections.push(await SECTION_FETCHERS[id]());
  }

  const totals: Record<string, number> = {};
  for (const sec of sections) {
    totals[sec.id] = sec.recordCount;
  }

  return {
    exportedAt: new Date().toISOString(),
    companyName: getCompanyName(),
    scope,
    sections,
    totals,
  };
}
