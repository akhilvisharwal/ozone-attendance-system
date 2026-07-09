import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import clsx from "clsx";
import {
  Users,
  UserCheck,
  UserX,
  UserMinus,
  Clock,
  LogIn,
  LogOut,
  RefreshCw,
  CalendarHeart,
  CalendarDays,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Spinner, EmptyState } from "@/components/ui/Spinner";
import { AttendanceRecordList } from "@/components/AttendanceRecordList";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { AttendanceDetailModal } from "@/components/AttendanceDetailModal";
import * as dashboardApi from "@/api/dashboard";
import { extractErrorMessage } from "@/api/client";
import type { AdminAttendanceRow, DashboardSummary } from "@/types";
import { sortTodayAttendanceByRecentActivity } from "@/utils/attendanceSort";

export function AdminDashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [today, setToday] = useState<AdminAttendanceRow[]>([]);
  const [reportDate, setReportDate] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminAttendanceRow | null>(null);

  const loadDashboard = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const [summaryRes, todayRes] = await Promise.all([
        dashboardApi.getDashboardSummary(),
        dashboardApi.getTodayAttendance(),
      ]);
      setSummary(summaryRes.summary);
      setReportDate(summaryRes.date);
      setToday(sortTodayAttendanceByRecentActivity(todayRes));
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

  const subtitle = reportDate
    ? `Workforce attendance overview for ${reportDate}`
    : "Workforce attendance overview for today";

  return (
    <div className="mx-auto w-full max-w-7xl">
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
        <div className="mb-5">
          <Alert variant="error">{error}</Alert>
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : (
        <div>
          <section aria-label="Attendance summary">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-9">
              <StatCard icon={<Users className="h-3.5 w-3.5" />} label="Total Employees" value={summary?.totalEmployees ?? 0} />
              <StatCard icon={<UserCheck className="h-3.5 w-3.5" />} label="Present Today" value={summary?.presentToday ?? 0} tone="green" />
              <StatCard icon={<UserMinus className="h-3.5 w-3.5" />} label="Half Day" value={summary?.halfDayToday ?? 0} tone="amber" />
              <StatCard icon={<UserX className="h-3.5 w-3.5" />} label="Absent Today" value={summary?.absentToday ?? 0} tone="red" />
              <StatCard icon={<CalendarHeart className="h-3.5 w-3.5" />} label="Worked on Holiday" value={summary?.holidayWorkedToday ?? 0} tone="teal" />
              <StatCard icon={<CalendarDays className="h-3.5 w-3.5" />} label="Worked on Weekly Off" value={summary?.weeklyOffWorkedToday ?? 0} tone="indigo" />
              <StatCard icon={<Clock className="h-3.5 w-3.5" />} label="Late Arrivals" value={summary?.lateArrivals ?? 0} tone="amber" />
              <StatCard icon={<LogIn className="h-3.5 w-3.5" />} label="Checked In" value={summary?.currentlyCheckedIn ?? 0} tone="blue" />
              <StatCard icon={<LogOut className="h-3.5 w-3.5" />} label="Checked Out" value={summary?.checkedOutToday ?? 0} />
            </div>
          </section>

          <Card className="mt-5">
            <CardHeader title="Today's Attendance" subtitle="Tap a row to view full details" />
            {today.length === 0 ? (
              <EmptyState title="No attendance recorded yet today" />
            ) : (
              <AttendanceRecordList
                records={today}
                onRecordClick={setSelected}
                showDate={false}
                showLocations={false}
                className="pt-1"
              />
            )}
          </Card>
        </div>
      )}

      <AttendanceDetailModal attendance={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

type StatTone = "slate" | "green" | "red" | "amber" | "blue" | "teal" | "indigo";

const STAT_TONE_CLASSES: Record<StatTone, { icon: string; ring: string }> = {
  slate: { icon: "bg-slate-100 text-slate-600", ring: "ring-slate-200/80" },
  green: { icon: "bg-emerald-50 text-emerald-600", ring: "ring-emerald-100" },
  red: { icon: "bg-red-50 text-red-600", ring: "ring-red-100" },
  amber: { icon: "bg-amber-50 text-amber-600", ring: "ring-amber-100" },
  blue: { icon: "bg-blue-50 text-blue-600", ring: "ring-blue-100" },
  teal: { icon: "bg-teal-50 text-teal-600", ring: "ring-teal-100" },
  indigo: { icon: "bg-indigo-50 text-indigo-600", ring: "ring-indigo-100" },
};

function StatCard({
  icon,
  label,
  value,
  tone = "slate",
}: {
  icon: ReactNode;
  label: string;
  value: number;
  tone?: StatTone;
}) {
  const styles = STAT_TONE_CLASSES[tone];

  return (
    <Card
      className={clsx(
        "flex h-14 min-w-0 items-center gap-2 rounded-lg px-2.5 py-2 shadow-none ring-1 ring-inset sm:h-[3.75rem] sm:gap-2.5 sm:px-3",
        styles.ring
      )}
    >
      <div
        className={clsx(
          "flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md sm:h-7 sm:w-7",
          styles.icon
        )}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-base font-semibold tabular-nums leading-none tracking-tight text-slate-900 sm:text-lg">
          {value}
        </p>
        <p
          className="mt-1 truncate text-[10px] font-medium leading-tight text-slate-500 sm:text-[11px]"
          title={label}
        >
          {label}
        </p>
      </div>
    </Card>
  );
}
