import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, LogOut } from "lucide-react";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ContentSkeleton } from "@/components/ui/Spinner";
import { WorkStatusBadge } from "@/components/ui/Badge";
import * as attendanceApi from "@/api/attendance";
import type { AttendanceRecord } from "@/types";
import { formatDate, formatMinutesAsHours, formatTime } from "@/utils/format";
import { AttendanceOverrideNoticeBanner } from "@/components/AttendanceOverrideNoticeBanner";
import { usePublicSettings } from "@/contexts/SettingsContext";
import { CheckInPanel } from "./CheckInPanel";
import { CheckOutPanel } from "./CheckOutPanel";
import { CheckOutConfirmModal } from "@/components/CheckOutConfirmModal";
import { useOfflineAttendanceSync } from "@/hooks/useOfflineAttendanceSync";
import { peekPendingAttendance, getPendingAttendance } from "@/utils/offlineAttendanceQueue";
import { Alert } from "@/components/ui/Alert";

export function EmployeeHomePage() {
  const { publicSettings, refresh: refreshPublicSettings } = usePublicSettings();
  const [attendance, setAttendance] = useState<AttendanceRecord | null | undefined>(undefined);
  const [showCheckOutConfirm, setShowCheckOutConfirm] = useState(false);
  const [showCheckOutForm, setShowCheckOutForm] = useState(false);

  const [pendingCount, setPendingCount] = useState(0);

  const refresh = useCallback(() => {
    attendanceApi.myToday().then((record) => {
      setAttendance(record);
      setPendingCount(getPendingAttendance().length);
    });
  }, []);

  useOfflineAttendanceSync(refresh);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        refresh();
        void refreshPublicSettings();
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [refresh, refreshPublicSettings]);

  useEffect(() => {
    if (attendance?.status !== "checked_in") {
      setShowCheckOutConfirm(false);
      setShowCheckOutForm(false);
    }
  }, [attendance?.status, attendance?.id]);

  function handleCheckedIn() {
    setShowCheckOutConfirm(false);
    setShowCheckOutForm(false);
    setPendingCount(getPendingAttendance().length);
    refresh();
  }

  function handleCheckedOut() {
    setShowCheckOutConfirm(false);
    setShowCheckOutForm(false);
    refresh();
  }

  return (
    <div className="mx-auto w-full max-w-lg space-y-3">
      <AttendanceOverrideNoticeBanner override={publicSettings?.attendanceOverride} compact />
      {pendingCount > 0 && (
        <Alert variant="info">
          Syncing pending attendance when your connection is available…
        </Alert>
      )}
      {attendance === undefined && <ContentSkeleton rows={3} />}

      {attendance === null && peekPendingAttendance()?.type === "check-in" && (
        <Card>
          <CardBody className="px-6 py-8 text-center">
            <h2 className="text-lg font-semibold text-slate-900">Check-in saved offline</h2>
            <p className="mt-2 text-sm text-slate-500">
              Your check-in will sync automatically when you are back online.
            </p>
          </CardBody>
        </Card>
      )}

      {attendance === null && peekPendingAttendance()?.type !== "check-in" && (
        <CheckInPanel onCheckedIn={handleCheckedIn} />
      )}

      {attendance && attendance.status === "checked_in" && !showCheckOutForm && (
        <CheckedInConfirmation
          attendance={attendance}
          onStartCheckOut={() => setShowCheckOutConfirm(true)}
        />
      )}

      <CheckOutConfirmModal
        open={showCheckOutConfirm}
        onCancel={() => setShowCheckOutConfirm(false)}
        onContinue={() => {
          setShowCheckOutConfirm(false);
          setShowCheckOutForm(true);
        }}
      />

      {attendance && attendance.status === "checked_in" && showCheckOutForm && (
        <CheckOutPanel
          attendance={attendance}
          onCheckedOut={handleCheckedOut}
          onCancel={() => setShowCheckOutForm(false)}
        />
      )}

      {attendance && attendance.status === "checked_out" && (
        <CompletedCard attendance={attendance} />
      )}
    </div>
  );
}

function CheckedInConfirmation({
  attendance,
  onStartCheckOut,
}: {
  attendance: AttendanceRecord;
  onStartCheckOut: () => void;
}) {
  return (
    <Card>
      <CardBody className="flex flex-col items-center gap-6 px-6 py-10 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
          <CheckCircle2 className="h-8 w-8" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-slate-900">You&apos;re checked in</h2>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-brand-600">
            {formatTime(attendance.check_in_time)}
          </p>
          {attendance.site_name && (
            <p className="mt-2 text-sm text-slate-500">{attendance.site_name}</p>
          )}
        </div>
        <Button
          size="lg"
          className="min-h-[3.25rem] w-full max-w-sm text-base font-semibold"
          icon={<LogOut className="h-5 w-5" />}
          onClick={onStartCheckOut}
        >
          Check Out
        </Button>
      </CardBody>
    </Card>
  );
}

function CompletedCard({ attendance }: { attendance: AttendanceRecord }) {
  return (
    <Card>
      <CardBody className="flex flex-col items-center gap-5 px-6 py-10 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-600">
          <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Attendance complete</h2>
          <p className="mt-1 text-sm text-slate-500">{formatDate(attendance.attendance_date)}</p>
        </div>
        <div className="grid w-full max-w-sm grid-cols-3 gap-3 text-left">
          <div className="rounded-lg bg-slate-50 px-3 py-2.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">In</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-900">{formatTime(attendance.check_in_time)}</p>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Out</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-900">{formatTime(attendance.check_out_time)}</p>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Hours</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-900">
              {formatMinutesAsHours(attendance.total_minutes)}
            </p>
          </div>
        </div>
        {attendance.work_status && (
          <WorkStatusBadge status={attendance.work_status} />
        )}
      </CardBody>
    </Card>
  );
}
