import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import clsx from "clsx";
import { motion } from "motion/react";
import { EASE_STANDARD, refreshCrossfadeVariants, staggerContainer, staggerItem } from "@/lib/motion";
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
  Bell,
  Wallet,
  Loader2,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Spinner, EmptyState } from "@/components/ui/Spinner";
import { AttendanceRecordList } from "@/components/AttendanceRecordList";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { CrossfadeSwitch } from "@/components/ui/CrossfadeSwitch";
import { AttendanceDetailModal } from "@/components/AttendanceDetailModal";
import { useToast } from "@/components/ui/Toast";
import * as dashboardApi from "@/api/dashboard";
import * as attendanceApi from "@/api/attendance";
import { extractErrorMessage } from "@/api/client";
import type { AdminAttendanceRow, DashboardSummary } from "@/types";
import { sortTodayAttendanceByRecentActivity } from "@/utils/attendanceSort";
import { usePermissions } from "@/auth/usePermissions";
import { Link } from "react-router-dom";

export function AdminDashboardPage() {
  const { can, isMasterAdmin } = usePermissions();
  const { showToast } = useToast();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [today, setToday] = useState<AdminAttendanceRow[]>([]);
  const [reportDate, setReportDate] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);
  const [reminding, setReminding] = useState(false);
  const remindingRef = useRef(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminAttendanceRow | null>(null);

  const loadDashboard = useCallback(async (options?: { silent?: boolean; userRefresh?: boolean }) => {
    const silent = options?.silent ?? false;
    const userRefresh = options?.userRefresh ?? false;

    if (userRefresh) {
      setRefreshing(true);
    } else if (!silent) {
      setLoading(true);
    }
    setLoadError(null);

    try {
      const [summaryRes, todayRes] = await Promise.all([
        dashboardApi.getDashboardSummary(),
        dashboardApi.getTodayAttendance(),
      ]);
      setSummary(summaryRes.summary);
      setReportDate(summaryRes.date);
      setToday(sortTodayAttendanceByRecentActivity(todayRes));
      if (userRefresh) {
        setDataVersion((version) => version + 1);
      }
    } catch (err) {
      setLoadError(extractErrorMessage(err, "Could not load dashboard statistics."));
    } finally {
      if (userRefresh) {
        setRefreshing(false);
      } else if (!silent) {
        setLoading(false);
      }
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

  async function handleSendReminders() {
    if (remindingRef.current) return;
    remindingRef.current = true;
    setReminding(true);

    try {
      const result = await attendanceApi.sendAttendanceReminders();
      showToast(
        result.sent === 0
          ? "No employees need an attendance reminder right now."
          : `Sent attendance reminders to ${result.sent} employee${result.sent === 1 ? "" : "s"}.`,
        result.sent === 0 ? "info" : "success"
      );
    } catch (err) {
      showToast(extractErrorMessage(err, "Could not send attendance reminders."), "error");
    } finally {
      remindingRef.current = false;
      setReminding(false);
    }
  }

  const subtitle = reportDate
    ? `Workforce attendance overview for ${reportDate}`
    : "Workforce attendance overview for today";

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        title="Admin Dashboard"
        subtitle={subtitle}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {can("sendAttendanceReminders") && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleSendReminders()}
                disabled={reminding || loading || refreshing}
                aria-busy={reminding}
                className={clsx(reminding && "pointer-events-none")}
              >
                {reminding ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Bell className="h-4 w-4" aria-hidden />
                )}
                Remind Absent
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              icon={<RefreshButtonIcon spinning={refreshing} />}
              onClick={() => void loadDashboard({ silent: true, userRefresh: true })}
              disabled={loading || refreshing}
              aria-busy={refreshing}
              className={clsx(
                "transition-opacity duration-200",
                refreshing && "pointer-events-none opacity-70"
              )}
            >
              Refresh
            </Button>
          </div>
        }
      />

      {loadError && (
        <div className="mb-5">
          <Alert variant="error">{loadError}</Alert>
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : (
        <CrossfadeSwitch state={dataVersion} variants={refreshCrossfadeVariants}>
          <div
            className={clsx(
              "transition-opacity duration-250 ease-[cubic-bezier(0.16,1,0.3,1)]",
              refreshing && "pointer-events-none opacity-60"
            )}
          >
            <section aria-label="Attendance summary">
              <motion.div
                variants={staggerContainer}
                initial="initial"
                animate="animate"
                className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-9"
              >
                <StatCard icon={<Users className="h-3.5 w-3.5" />} label="Total Employees" value={summary?.totalEmployees ?? 0} />
                <StatCard icon={<UserCheck className="h-3.5 w-3.5" />} label="Present Today" value={summary?.presentToday ?? 0} tone="green" />
                <StatCard icon={<UserMinus className="h-3.5 w-3.5" />} label="Half Day" value={summary?.halfDayToday ?? 0} tone="amber" />
                <StatCard icon={<UserX className="h-3.5 w-3.5" />} label="Absent Today" value={summary?.absentToday ?? 0} tone="red" />
                <StatCard icon={<CalendarHeart className="h-3.5 w-3.5" />} label="Worked on Holiday" value={summary?.holidayWorkedToday ?? 0} tone="teal" />
                <StatCard icon={<CalendarDays className="h-3.5 w-3.5" />} label="Worked on Weekly Off" value={summary?.weeklyOffWorkedToday ?? 0} tone="indigo" />
                <StatCard icon={<Clock className="h-3.5 w-3.5" />} label="Late Arrivals" value={summary?.lateArrivals ?? 0} tone="amber" />
                <StatCard icon={<LogIn className="h-3.5 w-3.5" />} label="Checked In" value={summary?.currentlyCheckedIn ?? 0} tone="blue" />
                <StatCard icon={<LogOut className="h-3.5 w-3.5" />} label="Checked Out" value={summary?.checkedOutToday ?? 0} />
              </motion.div>
              {isMasterAdmin && (summary?.pendingReimbursementRequests ?? 0) > 0 && (
                <Link
                  to="/admin/expense-management"
                  className="mt-3 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm transition-colors hover:bg-amber-50"
                >
                  <span className="flex items-center gap-2 font-medium text-amber-900">
                    <Wallet className="h-4 w-4" />
                    Pending reimbursements
                  </span>
                  <span className="font-semibold text-amber-900">
                    {summary?.pendingReimbursementRequests ?? 0} ·{" "}
                    {new Intl.NumberFormat("en-IN", {
                      style: "currency",
                      currency: "INR",
                      maximumFractionDigits: 0,
                    }).format(summary?.pendingReimbursementAmount ?? 0)}
                  </span>
                </Link>
              )}
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
        </CrossfadeSwitch>
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

function RefreshButtonIcon({ spinning }: { spinning: boolean }) {
  return (
    <motion.span
      className="inline-flex"
      animate={spinning ? { rotate: 360 } : { rotate: 0 }}
      transition={
        spinning
          ? { duration: 0.9, ease: "easeInOut", repeat: Infinity }
          : { duration: 0.25, ease: EASE_STANDARD }
      }
    >
      <RefreshCw className="h-4 w-4" />
    </motion.span>
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
  tone?: StatTone;
}) {
  const styles = STAT_TONE_CLASSES[tone];

  return (
    <motion.div
      variants={staggerItem}
      className={clsx(
        "flex h-14 min-w-0 items-center gap-2 rounded-lg border border-slate-200/80 bg-white px-2.5 py-2 ring-1 ring-inset sm:h-[3.75rem] sm:gap-2.5 sm:px-3",
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
    </motion.div>
  );
}
