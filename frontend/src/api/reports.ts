import { apiClient } from "./client";

export interface ExportReportParams {
  format: "excel" | "pdf";
  period: "daily" | "weekly" | "monthly" | "custom";
  from?: string;
  to?: string;
  employeeId?: string;
}

export interface ViewReportParams {
  period: "daily" | "weekly" | "monthly" | "custom";
  from?: string;
  to?: string;
  employeeId?: string;
}

export interface ReportRow {
  employee_code: string;
  employee_name: string;
  attendance_date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  total_minutes: number | null;
  working_hours: string;
  day_status: string | null;
  site_name: string | null;
  work_status: string | null;
  work_summary: string | null;
  check_in_address: string | null;
  remarks: string | null;
}

export async function viewReport(params: ViewReportParams) {
  const res = await apiClient.get<{ rows: ReportRow[]; from: string; to: string; total: number }>(
    "/reports/view",
    { params }
  );
  return res.data;
}

export async function exportReport(params: ExportReportParams) {
  const res = await apiClient.get("/reports/export", { params, responseType: "blob" });

  const disposition = res.headers["content-disposition"] as string | undefined;
  const match = disposition?.match(/filename="(.+)"/);
  const filename = match?.[1] ?? `attendance-report.${params.format === "excel" ? "xlsx" : "pdf"}`;

  const blobUrl = URL.createObjectURL(res.data as Blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(blobUrl);
}
