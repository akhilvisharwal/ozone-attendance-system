import { useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Spinner, EmptyState } from "@/components/ui/Spinner";
import { AttendanceStatusBadge, AttendanceDayBadge } from "@/components/ui/Badge";
import { AttendanceDetailModal } from "@/components/AttendanceDetailModal";
import { EmployeeMonthlyCalendar } from "@/components/EmployeeMonthlyCalendar";
import { EmployeeMonthlySummaryPanel } from "@/components/EmployeeMonthlySummaryPanel";
import { ResponsiveTable, type Column } from "@/components/ui/ResponsiveTable";
import { CrossfadeSwitch } from "@/components/ui/CrossfadeSwitch";
import { useEmployeeMonthlyDashboard } from "@/hooks/useEmployeeMonthlyDashboard";
import type { AttendanceRecord } from "@/types";
import { formatDate, formatMinutesAsHours, formatTime } from "@/utils/format";

export function AttendanceHistoryPage() {
  const { month, setMonth, grid, records, extendedStats, loading } = useEmployeeMonthlyDashboard();
  const [selected, setSelected] = useState<AttendanceRecord | null>(null);

  const summary = grid?.employees[0]?.summary ?? null;

  const columns: Column<AttendanceRecord>[] = [
    {
      header: "Date",
      primary: true,
      cell: (item) => <span className="font-medium text-slate-900">{formatDate(item.attendance_date)}</span>,
    },
    { header: "Check-in", cell: (item) => formatTime(item.check_in_time) },
    { header: "Check-out", cell: (item) => formatTime(item.check_out_time) },
    { header: "Hours", cell: (item) => formatMinutesAsHours(item.total_minutes) },
    {
      header: "Attendance",
      cell: (item) => (
        <AttendanceDayBadge
          dayStatus={item.day_status}
          specialDayStatus={item.special_day_status}
          adminMarkStatus={item.is_admin_marked ? item.admin_mark_status : null}
        />
      ),
    },
    { header: "Status", cell: (item) => <AttendanceStatusBadge status={item.status} /> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Attendance"
        subtitle="Monthly overview, calendar, and record history"
      />

      <div className="grid gap-4 xl:grid-cols-5">
        <div className="xl:col-span-2">
          <EmployeeMonthlySummaryPanel
            label={grid?.label ?? "Selected month"}
            summary={summary}
            extended={extendedStats}
            loading={loading}
          />
        </div>
        <div className="xl:col-span-3">
          <EmployeeMonthlyCalendar
            month={month}
            onMonthChange={setMonth}
            grid={grid}
            loading={loading}
          />
        </div>
      </div>

      <Card>
        <div className="border-b border-slate-100 px-5 py-4">
          <h3 className="text-base font-semibold text-slate-900">Records</h3>
          <p className="mt-0.5 text-sm text-slate-500">
            {grid?.label ?? "Selected month"} · tap a row for details
          </p>
        </div>
        <CrossfadeSwitch state={loading ? "loading" : "content"}>
        {loading ? (
          <Spinner />
        ) : records.length === 0 ? (
          <EmptyState
            title="No attendance records"
            description="Records for this month will appear here after you check in."
          />
        ) : (
          <ResponsiveTable
            columns={columns}
            data={records}
            rowKey={(item) => item.id}
            onRowClick={setSelected}
          />
        )}
        </CrossfadeSwitch>
      </Card>

      <AttendanceDetailModal
        attendance={selected}
        onClose={() => setSelected(null)}
        showLocationDetails={false}
      />
    </div>
  );
}
