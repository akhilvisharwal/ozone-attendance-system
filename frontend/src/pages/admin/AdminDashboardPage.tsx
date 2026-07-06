import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Users, UserCheck, UserX, UserMinus, Clock, LogIn, LogOut } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Spinner, EmptyState } from "@/components/ui/Spinner";
import { AttendanceStatusBadge, WorkStatusBadge, DayStatusBadge } from "@/components/ui/Badge";
import { AttendanceDetailModal } from "@/components/AttendanceDetailModal";
import { ResponsiveTable, type Column } from "@/components/ui/ResponsiveTable";
import * as dashboardApi from "@/api/dashboard";
import type { AdminAttendanceRow, DashboardSummary } from "@/types";
import { formatMinutesAsHours, formatTime } from "@/utils/format";

export function AdminDashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [today, setToday] = useState<AdminAttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AdminAttendanceRow | null>(null);

  useEffect(() => {
    Promise.all([dashboardApi.getDashboardSummary(), dashboardApi.getTodayAttendance()])
      .then(([summaryRes, todayRes]) => {
        setSummary(summaryRes.summary);
        setToday(todayRes);
      })
      .finally(() => setLoading(false));
  }, []);

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

  return (
    <div>
      <PageHeader title="Admin Dashboard" subtitle="Workforce attendance overview for today" />

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
