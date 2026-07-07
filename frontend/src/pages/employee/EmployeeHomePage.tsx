import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  Building2,
  CalendarHeart,
  CheckCircle2,
  Clock,
  LogOut,
  MapPin,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { SecureImage } from "@/components/SecureImage";
import { WorkStatusBadge } from "@/components/ui/Badge";
import { TodayAttendanceStatusCard } from "@/components/TodayAttendanceStatusCard";
import { useAuth } from "@/auth/AuthContext";
import * as attendanceApi from "@/api/attendance";
import * as holidaysApi from "@/api/holidays";
import type { AttendanceRecord } from "@/types";
import type { ResolvedHoliday } from "@/api/holidays";
import { formatDate, formatMinutesAsHours, formatTime } from "@/utils/format";
import { CheckInPanel } from "./CheckInPanel";
import { CheckOutPanel } from "./CheckOutPanel";
import { CheckOutConfirmModal } from "@/components/CheckOutConfirmModal";
import { TaskDashboardWidget } from "@/components/tasks/TaskDashboardWidget";
import * as tasksApi from "@/api/tasks";
import type { TaskAnalytics } from "@/types";

export function EmployeeHomePage() {
  const { employee } = useAuth();
  const [attendance, setAttendance] = useState<AttendanceRecord | null | undefined>(undefined);
  const [upcomingHolidays, setUpcomingHolidays] = useState<ResolvedHoliday[]>([]);
  const [showCheckOutConfirm, setShowCheckOutConfirm] = useState(false);
  const [showCheckOutForm, setShowCheckOutForm] = useState(false);
  const [taskAnalytics, setTaskAnalytics] = useState<TaskAnalytics | null>(null);

  const refresh = useCallback(() => {
    attendanceApi.myToday().then(setAttendance);
    holidaysApi.getUpcomingHolidays(5).then(setUpcomingHolidays).catch(() => setUpcomingHolidays([]));
    tasksApi.getMyTaskAnalytics().then(setTaskAnalytics).catch(() => setTaskAnalytics(null));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        refresh();
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [refresh]);

  useEffect(() => {
    if (attendance?.status !== "checked_in") {
      setShowCheckOutConfirm(false);
      setShowCheckOutForm(false);
    }
  }, [attendance?.status, attendance?.id]);

  function handleCheckedIn() {
    setShowCheckOutConfirm(false);
    setShowCheckOutForm(false);
    refresh();
  }

  function handleCheckedOut() {
    setShowCheckOutConfirm(false);
    setShowCheckOutForm(false);
    refresh();
  }

  function handleContinueToCheckOut() {
    setShowCheckOutConfirm(false);
    setShowCheckOutForm(true);
  }

  return (
    <div>
      <PageHeader
        title={`Welcome, ${employee?.name ?? ""}`}
        subtitle={formatDate(new Date().toISOString())}
      />

      <TaskDashboardWidget analytics={taskAnalytics} tasksLink="/tasks" title="My Tasks" />

      {upcomingHolidays.length > 0 && (
        <Card className="mb-4">
          <CardHeader title="Upcoming Holidays" />
          <CardBody className="divide-y divide-slate-100 p-0">
            {upcomingHolidays.map((h) => (
              <div key={`${h.id}-${h.holiday_date}`} className="flex items-center gap-3 px-4 py-3">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                  <CalendarHeart className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{h.name}</p>
                  <p className="text-xs text-slate-500">{formatDate(h.holiday_date)}</p>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      {attendance === undefined && <Spinner />}

      {attendance === null && (
        <>
          <TodayAttendanceStatusCard attendance={null} className="mb-4" />
          <CheckInPanel onCheckedIn={handleCheckedIn} />
        </>
      )}

      {attendance && attendance.status === "checked_in" && !showCheckOutForm && (
        <CheckedInSummaryCard
          attendance={attendance}
          onStartCheckOut={() => setShowCheckOutConfirm(true)}
        />
      )}

      <CheckOutConfirmModal
        open={showCheckOutConfirm}
        onCancel={() => setShowCheckOutConfirm(false)}
        onContinue={handleContinueToCheckOut}
      />

      {attendance && attendance.status === "checked_in" && showCheckOutForm && (
        <CheckOutPanel
          attendance={attendance}
          onCheckedOut={handleCheckedOut}
          onCancel={() => setShowCheckOutForm(false)}
        />
      )}

      {attendance && attendance.status === "checked_out" && <CompletedCard attendance={attendance} />}
    </div>
  );
}

function CheckedInSummaryCard({
  attendance,
  onStartCheckOut,
}: {
  attendance: AttendanceRecord;
  onStartCheckOut: () => void;
}) {
  const elapsedMinutes = attendance.check_in_time
    ? Math.max(
        0,
        Math.round((Date.now() - new Date(attendance.check_in_time).getTime()) / 60000)
      )
    : null;

  return (
    <Card>
      <CardHeader
        title="Checked In Successfully"
        subtitle="Your attendance is recorded. Check out when you finish work for the day."
      />
      <CardBody className="flex flex-col gap-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <SecureImage
            path={attendance.check_in_selfie_path}
            alt="Check-in selfie"
            className="h-28 w-28 flex-shrink-0 rounded-xl object-cover ring-1 ring-slate-200"
          />
          <div className="grid flex-1 gap-3 sm:grid-cols-2">
            <SummaryItem
              icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
              label="Check-in Time"
              value={formatTime(attendance.check_in_time)}
            />
            <SummaryItem
              icon={<Clock className="h-4 w-4 text-slate-500" />}
              label="Time Elapsed"
              value={elapsedMinutes !== null ? formatMinutesAsHours(elapsedMinutes) : "-"}
            />
            {attendance.site_name && (
              <SummaryItem
                icon={<Building2 className="h-4 w-4 text-slate-500" />}
                label="Project / Site"
                value={attendance.site_name}
              />
            )}
            {attendance.check_in_address && (
              <SummaryItem
                icon={<MapPin className="h-4 w-4 text-slate-500" />}
                label="Check-in Location"
                value={attendance.check_in_address}
                className="sm:col-span-2"
              />
            )}
          </div>
        </div>

        <TodayAttendanceStatusCard attendance={attendance} />

        {(attendance.work_summary || attendance.work_status) && (
          <div className="rounded-lg bg-slate-50 p-4 text-sm">
            {attendance.work_summary && (
              <div>
                <p className="font-medium text-slate-700">Work Summary (at check-in)</p>
                <p className="mt-1 text-slate-600">{attendance.work_summary}</p>
              </div>
            )}
            {attendance.work_status && (
              <div className={attendance.work_summary ? "mt-3" : undefined}>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Work Status</p>
                <WorkStatusBadge status={attendance.work_status} />
              </div>
            )}
          </div>
        )}

        <div className="rounded-lg border border-brand-100 bg-brand-50/60 p-4">
          <p className="text-sm text-slate-600">
            When you are ready to finish for the day, continue to check-out to submit your work summary and complete
            attendance.
          </p>
          <Button
            size="lg"
            className="mt-4 w-full sm:w-auto"
            icon={<LogOut className="h-5 w-5" />}
            onClick={onStartCheckOut}
          >
            Check Out
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function SummaryItem({
  icon,
  label,
  value,
  className,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 flex items-start gap-1.5 text-sm font-medium text-slate-900">
        <span className="mt-0.5 flex-shrink-0">{icon}</span>
        <span>{value}</span>
      </p>
    </div>
  );
}

function CompletedCard({ attendance }: { attendance: AttendanceRecord }) {
  return (
    <Card>
      <CardHeader title="Today's Attendance Complete" subtitle="You have successfully checked out for the day" />
      <CardBody className="flex flex-col gap-5">
        <TodayAttendanceStatusCard attendance={attendance} />

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat icon={<Clock className="h-4 w-4" />} label="Check-in" value={formatTime(attendance.check_in_time)} />
          <Stat icon={<Clock className="h-4 w-4" />} label="Check-out" value={formatTime(attendance.check_out_time)} />
          <Stat label="Total Hours" value={formatMinutesAsHours(attendance.total_minutes)} />
        </div>

        {attendance.work_status && (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Work Status</span>
            <WorkStatusBadge status={attendance.work_status} />
          </div>
        )}

        <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
          <p className="font-medium text-slate-700">Work Summary</p>
          <p className="mt-1">{attendance.work_summary}</p>
        </div>
      </CardBody>
    </Card>
  );
}

function Stat({ icon, label, value }: { icon?: ReactNode; label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</span>
      <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
        {icon}
        {value}
      </span>
    </div>
  );
}
