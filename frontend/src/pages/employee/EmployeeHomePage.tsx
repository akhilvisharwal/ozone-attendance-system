import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Building2, CalendarHeart, CheckCircle2, Clock, MapPin } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { SecureImage } from "@/components/SecureImage";
import { WorkStatusBadge, DayStatusBadge } from "@/components/ui/Badge";
import { useAuth } from "@/auth/AuthContext";
import * as attendanceApi from "@/api/attendance";
import * as holidaysApi from "@/api/holidays";
import type { AttendanceRecord } from "@/types";
import type { ResolvedHoliday } from "@/api/holidays";
import { formatDate, formatMinutesAsHours, formatTime } from "@/utils/format";
import { CheckInPanel } from "./CheckInPanel";
import { CheckOutPanel } from "./CheckOutPanel";

export function EmployeeHomePage() {
  const { employee } = useAuth();
  const [attendance, setAttendance] = useState<AttendanceRecord | null | undefined>(undefined);
  const [upcomingHolidays, setUpcomingHolidays] = useState<ResolvedHoliday[]>([]);

  const refresh = useCallback(() => {
    attendanceApi.myToday().then(setAttendance);
    holidaysApi.getUpcomingHolidays(5).then(setUpcomingHolidays).catch(() => setUpcomingHolidays([]));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div>
      <PageHeader
        title={`Welcome, ${employee?.name ?? ""}`}
        subtitle={formatDate(new Date().toISOString())}
      />

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

      {attendance === null && <CheckInPanel onCheckedIn={refresh} />}

      {attendance && attendance.status === "checked_in" && (
        <div className="flex flex-col gap-6">
          <TodayStatusCard attendance={attendance} />
          <CheckOutPanel attendance={attendance} onCheckedOut={refresh} />
        </div>
      )}

      {attendance && attendance.status === "checked_out" && <CompletedCard attendance={attendance} />}
    </div>
  );
}

function TodayStatusCard({ attendance }: { attendance: AttendanceRecord }) {
  return (
    <Card>
      <CardHeader title="Today's Status" />
      <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <SecureImage
          path={attendance.check_in_selfie_path}
          alt="Check-in selfie"
          className="h-20 w-20 rounded-lg object-cover"
        />
        <div className="flex flex-col gap-1 text-sm">
          <span className="flex items-center gap-1.5 font-medium text-emerald-600">
            <CheckCircle2 className="h-4 w-4" /> Checked in at {formatTime(attendance.check_in_time)}
          </span>
          {attendance.site_name && (
            <span className="flex items-center gap-1.5 text-slate-500">
              <Building2 className="h-4 w-4 flex-shrink-0" /> {attendance.site_name}
            </span>
          )}
          {attendance.check_in_address && (
            <span className="flex items-start gap-1.5 text-slate-500">
              <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0" /> {attendance.check_in_address}
            </span>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

function CompletedCard({ attendance }: { attendance: AttendanceRecord }) {
  return (
    <Card>
      <CardHeader title="Today's Attendance Complete" subtitle="You have successfully checked out for the day" />
      <CardBody className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat icon={<Clock className="h-4 w-4" />} label="Check-in" value={formatTime(attendance.check_in_time)} />
          <Stat icon={<Clock className="h-4 w-4" />} label="Check-out" value={formatTime(attendance.check_out_time)} />
          <Stat label="Total Hours" value={formatMinutesAsHours(attendance.total_minutes)} />
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Attendance</span>
            <div className="flex flex-wrap gap-1.5">
              <DayStatusBadge status={attendance.day_status} />
              <WorkStatusBadge status={attendance.work_status} />
            </div>
          </div>
        </div>
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
