import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Users, UserCheck, UserX, UserMinus, Clock, LogIn, LogOut, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Spinner, EmptyState } from "@/components/ui/Spinner";
import { AttendanceStatusBadge, WorkStatusBadge, DayStatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { AttendanceDetailModal } from "@/components/AttendanceDetailModal";
import { TaskDashboardWidget } from "@/components/tasks/TaskDashboardWidget";
import { ResponsiveTable, type Column } from "@/components/ui/ResponsiveTable";
import * as dashboardApi from "@/api/dashboard";
import * as tasksApi from "@/api/tasks";
import { extractErrorMessage } from "@/api/client";
import type { AdminAttendanceRow, DashboardSummary, TaskAnalytics } from "@/types";
import { formatMinutesAsHours, formatTime } from "@/utils/format";
import { sortTodayAttendanceByRecentActivity } from "@/utils/attendanceSort";

export function AdminDashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [today, setToday] = useState<AdminAttendanceRow[]>([]);
  const [reportDate, setReportDate] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminAttendanceRow | null>(null);
  const [taskAnalytics, setTaskAnalytics] = useState<TaskAnalytics | null>(null);

  const loadDashboard = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const [summaryRes, todayRes, taskStats] = await Promise.all([
        dashboardApi.getDashboardSummary(),
        dashboardApi.getTodayAttendance(),
        tasksApi.adminGetTaskAnalytics(),
      ]);
      setSummary(summaryRes.summary);
      setReportDate(summaryRes.date);
      setToday(sortTodayAttendanceByRecentActivity(todayRes));
      setTaskAnalytics(taskStats);
    } catch (err) {
      setError(extractErrorMessage(err, "Could not load dashboard statistics."));
    } finally {
      if (silent) setRefreshing(false);
      else setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        loadDashboard({ silent: true });
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [loadDashboard]);

  const todayColumns: Column<AdminAttendanceRow>[] = [
    {
      header: "Employee",
      primary: true,
      cell: (row) => (
        <div>
          <p className="font-medium text-slate-900">{row.employee_name}</p>
          <p className="text-xs text-slate-400">{row.employee_code}</p>
        </div>
      ),
    },
    { header: "Check-in", cell: (row) => formatTime(row.check_in_time) },
    { header: "Check-out", cell: (row) => formatTime(row.check_out_time) },
    { header: "Hours", cell: (row) => formatMinutesAsHours(row.total_minutes) },
    { header: "Attendance", cell: (row) => <DayStatusBadge status={row.day_status} /> },
    { header: "Project", cell: (row) => row.site_name ?? "-" },
    { header: "Work Status", cell: (row) => <WorkStatusBadge status={row.work_status} /> },
    { header: "Status", cell: (row) => <AttendanceStatusBadge status={row.status} /> },
  ];

  const subtitle = reportDate
    ? `Workforce attendance overview for ${reportDate}`
    : "Workforce attendance overview for today";

  return (
    <div>
      <PageHeader
        title="Admin Dashboard"
        subtitle={subtitle}
        action={
          <Button
            variant="outline"
            size="sm"
            icon={<RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />}
            onClick={() => loadDashboard({ silent: !loading })}
            disabled={loading || refreshing}
          >
            Refresh
          </Button>
        }
      />

      {error && (
        <div className="mb-4">
          <Alert variant="error">{error}</Alert>
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-7">
            <StatCard icon={<Users className="h-5 w-5" />} label="Total Employees" value={summary?.totalEmployees ?? 0} />
            <StatCard icon={<UserCheck className="h-5 w-5" />} label="Present Today" value={summary?.presentToday ?? 0} tone="green" />
            <StatCard icon={<UserMinus className="h-5 w-5" />} label="Half Day" value={summary?.halfDayToday ?? 0} tone="amber" />
            <StatCard icon={<UserX className="h-5 w-5" />} label="Absent Today" value={summary?.absentToday ?? 0} tone="red" />
            <StatCard icon={<Clock className="h-5 w-5" />} label="Late Arrivals" value={summary?.lateArrivals ?? 0} tone="amber" />
            <StatCard icon={<LogIn className="h-5 w-5" />} label="Checked In" value={summary?.currentlyCheckedIn ?? 0} tone="blue" />
            <StatCard icon={<LogOut className="h-5 w-5" />} label="Checked Out" value={summary?.checkedOutToday ?? 0} />
          </div>

          <TaskDashboardWidget analytics={taskAnalytics} tasksLink="/admin/tasks" title="Task Analytics" />

          <Card>
            <CardHeader title="Today's Attendance" subtitle="Tap a row to view full details" />
            {today.length === 0 ? (
              <EmptyState title="No attendance recorded yet today" />
            ) : (
              <ResponsiveTable
                columns={todayColumns}
                data={today}
                rowKey={(row) => row.id}
                onRowClick={setSelected}
              />
            )}
          </Card>
        </>
      )}

      <AttendanceDetailModal attendance={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone = "slate",
}: {
  icon: ReactNode;
  label: string;
  value: number;
  tone?: "slate" | "green" | "red" | "amber" | "blue";
}) {
  const toneClasses: Record<string, string> = {
    slate: "bg-slate-100 text-slate-600",
    green: "bg-emerald-50 text-emerald-600",
    red: "bg-red-50 text-red-600",
    amber: "bg-amber-50 text-amber-600",
    blue: "bg-blue-50 text-blue-600",
  };

  return (
    <Card className="flex items-center gap-3 p-4">
      <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${toneClasses[tone]}`}>
        {icon}
      </div>
      <div>
        <p className="text-xl font-bold text-slate-900">{value}</p>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
    </Card>
  );
}
