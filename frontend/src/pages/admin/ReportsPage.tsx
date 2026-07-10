import { useState } from "react";
import { Download, FileSpreadsheet, FileText, Search } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Select, Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/Spinner";
import { WorkStatusBadge, AttendanceDayBadge } from "@/components/ui/Badge";
import type { DayStatus } from "@/types";
import { ResponsiveTable, type Column } from "@/components/ui/ResponsiveTable";
import { EmployeeCombobox } from "@/components/EmployeeCombobox";
import { EmployeeAvatar } from "@/components/EmployeeAvatar";
import * as reportsApi from "@/api/reports";
import type { ExportReportParams, ReportRow, ViewReportParams } from "@/api/reports";
import { extractErrorMessage } from "@/api/client";

export function ReportsPage() {
  const [period, setPeriod] = useState<ExportReportParams["period"]>("monthly");
  const [employeeId, setEmployeeId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<"excel" | "pdf" | null>(null);

  // View mode
  const [viewRows, setViewRows] = useState<ReportRow[] | null>(null);
  const [viewPeriod, setViewPeriod] = useState<{ from: string; to: string } | null>(null);
  const [viewing, setViewing] = useState(false);

  const reportParams: ViewReportParams = {
    period,
    from: period === "custom" ? from || undefined : undefined,
    to: period === "custom" ? to || undefined : undefined,
    employeeId: employeeId || undefined,
  };

  async function handleView() {
    setError(null);
    setViewing(true);
    try {
      const res = await reportsApi.viewReport(reportParams);
      setViewRows(res.rows);
      setViewPeriod({ from: res.from, to: res.to });
    } catch (err) {
      setError(extractErrorMessage(err, "Could not load the report"));
    } finally {
      setViewing(false);
    }
  }

  async function handleExport(format: "excel" | "pdf") {
    setError(null);
    setDownloading(format);
    try {
      await reportsApi.exportReport({ ...reportParams, format });
    } catch (err) {
      setError(extractErrorMessage(err, "Could not generate the report"));
    } finally {
      setDownloading(null);
    }
  }

  const reportColumns: Column<ReportRow>[] = [
    {
      header: "Employee",
      primary: true,
      cell: (row) => (
        <div className="flex items-center gap-3">
          <EmployeeAvatar
            name={row.employee_name}
            photoPath={row.employee_profile_photo_path}
            size="sm"
          />
          <div>
            <p className="font-medium text-slate-900">{row.employee_name}</p>
            <p className="text-xs text-slate-400">{row.employee_code}</p>
          </div>
        </div>
      ),
    },
    { header: "Role", cell: (row) => row.designation?.trim() || "—" },
    { header: "Date", cell: (row) => row.attendance_date },
    { header: "Check-in", cell: (row) => row.check_in_time ?? "-" },
    { header: "Check-out", cell: (row) => row.check_out_time ?? "-" },
    { header: "Hours", cell: (row) => row.working_hours },
    {
      header: "Attendance",
      cell: (row) =>
        row.special_day_status ? (
          <AttendanceDayBadge
            dayStatus={(row.day_status as DayStatus | null) ?? null}
            specialDayStatus={row.special_day_status}
          />
        ) : (
          <span className="text-sm text-slate-700">{row.attendance_label ?? row.day_status ?? "-"}</span>
        ),
    },
    { header: "Project", cell: (row) => row.site_name ?? "-" },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { header: "Work Status", cell: (row) => <WorkStatusBadge status={row.work_status as any} /> },
    {
      header: "Summary",
      cell: (row) => <p className="line-clamp-2 text-sm text-slate-600">{row.work_summary ?? "-"}</p>,
    },
    { header: "Remarks", cell: (row) => row.remarks ?? "-" },
  ];

  return (
    <div>
      <PageHeader title="Attendance Reports" subtitle="View reports in-browser or download Excel / PDF" />

      <Card className="mb-6 max-w-3xl">
        <CardHeader title="Report Filters" />
        <CardBody className="flex flex-col gap-4">
          {error && <Alert variant="error">{error}</Alert>}

          <Select label="Period" value={period} onChange={(e) => setPeriod(e.target.value as ExportReportParams["period"])}>
            <option value="daily">Daily (today)</option>
            <option value="weekly">Weekly (last 7 days)</option>
            <option value="monthly">Monthly (this month)</option>
            <option value="custom">Custom Date Range</option>
          </Select>

          {period === "custom" && (
            <div className="grid grid-cols-2 gap-3">
              <Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              <Input label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          )}

          <EmployeeCombobox
            label="Employee"
            hint="Search by name or employee ID — only active employees are listed"
            value={employeeId}
            onChange={setEmployeeId}
          />

          <div className="flex flex-wrap gap-3 pt-1">
            <Button
              variant="primary"
              icon={<Search className="h-4 w-4" />}
              isLoading={viewing}
              onClick={handleView}
            >
              View Report
            </Button>
            <Button
              variant="outline"
              icon={<FileSpreadsheet className="h-4 w-4" />}
              isLoading={downloading === "excel"}
              onClick={() => handleExport("excel")}
            >
              Download Excel
            </Button>
            <Button
              variant="outline"
              icon={<FileText className="h-4 w-4" />}
              isLoading={downloading === "pdf"}
              onClick={() => handleExport("pdf")}
            >
              Download PDF
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* In-browser view */}
      {viewRows !== null && (
        <Card>
          <CardHeader
            title={`Report: ${viewPeriod?.from} → ${viewPeriod?.to}`}
            subtitle={`${viewRows.length} record(s)`}
            action={
              <div className="flex gap-2">
                <Button size="sm" variant="outline" icon={<Download className="h-3.5 w-3.5" />} isLoading={downloading === "excel"} onClick={() => handleExport("excel")}>Excel</Button>
                <Button size="sm" variant="outline" icon={<Download className="h-3.5 w-3.5" />} isLoading={downloading === "pdf"} onClick={() => handleExport("pdf")}>PDF</Button>
              </div>
            }
          />
          {viewRows.length === 0 ? (
            <EmptyState title="No records for this period / filter" />
          ) : (
            <ResponsiveTable columns={reportColumns} data={viewRows} rowKey={(_, i) => String(i)} />
          )}
        </Card>
      )}
    </div>
  );
}
