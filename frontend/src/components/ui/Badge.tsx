import clsx from "clsx";
import type { ReactNode } from "react";
import type { WorkStatus, AttendanceStatus, CheckInStatus, CheckOutStatus, DayStatus, SpecialDayStatus, ManualAttendanceStatus } from "@/types";

type Tone = "green" | "amber" | "red" | "slate" | "blue";

const toneClasses: Record<Tone, string> = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  amber: "bg-amber-50 text-amber-700 ring-amber-600/20",
  red: "bg-red-50 text-red-700 ring-red-600/20",
  slate: "bg-slate-100 text-slate-600 ring-slate-500/20",
  blue: "bg-blue-50 text-blue-700 ring-blue-600/20",
};

export function Badge({ tone = "slate", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        toneClasses[tone]
      )}
    >
      {children}
    </span>
  );
}

const WORK_STATUS_LABEL: Record<WorkStatus, string> = {
  completed: "Completed",
  in_progress: "In Progress",
  pending: "Pending",
  on_hold: "On Hold",
  cancelled: "Cancelled",
};

const WORK_STATUS_TONE: Record<WorkStatus, Tone> = {
  completed: "green",
  in_progress: "blue",
  pending: "amber",
  on_hold: "red",
  cancelled: "slate",
};

export function WorkStatusBadge({ status }: { status: WorkStatus | null }) {
  if (!status) return <Badge>-</Badge>;
  return <Badge tone={WORK_STATUS_TONE[status]}>{WORK_STATUS_LABEL[status]}</Badge>;
}

export function AttendanceStatusBadge({ status }: { status: AttendanceStatus }) {
  if (status === "checked_in") return <Badge tone="blue">Checked In</Badge>;
  if (status === "absent") return <Badge tone="red">Absent</Badge>;
  return <Badge tone="green">Checked Out</Badge>;
}

const DAY_STATUS_LABEL: Record<DayStatus, string> = {
  present: "Present",
  half_day: "Half Day",
  absent: "Absent",
};

const DAY_STATUS_TONE: Record<DayStatus, Tone> = {
  present: "green",
  half_day: "amber",
  absent: "red",
};

/** The automatic daily result derived from hours worked (Present / Half Day / Absent). */
export function DayStatusBadge({ status }: { status: DayStatus | null }) {
  if (!status) return <Badge tone="slate">Pending</Badge>;
  return <Badge tone={DAY_STATUS_TONE[status]}>{DAY_STATUS_LABEL[status]}</Badge>;
}

const CHECK_IN_STATUS_LABEL: Record<CheckInStatus, string> = {
  early:    "Early",
  on_time:  "On Time",
  late:     "Late",
  half_day: "Half Day",
};

const CHECK_IN_STATUS_TONE: Record<CheckInStatus, Tone> = {
  early:    "blue",
  on_time:  "green",
  late:     "amber",
  half_day: "red",
};

export function CheckInStatusBadge({ status }: { status: CheckInStatus | null }) {
  if (!status) return null;
  return <Badge tone={CHECK_IN_STATUS_TONE[status]}>{CHECK_IN_STATUS_LABEL[status]}</Badge>;
}

const CHECK_OUT_STATUS_LABEL: Record<CheckOutStatus, string> = {
  early:    "Early Out",
  on_time:  "On Time",
  overtime: "Overtime",
};

const CHECK_OUT_STATUS_TONE: Record<CheckOutStatus, Tone> = {
  early:    "amber",
  on_time:  "green",
  overtime: "blue",
};

export function CheckOutStatusBadge({ status }: { status: CheckOutStatus | null }) {
  if (!status) return null;
  return <Badge tone={CHECK_OUT_STATUS_TONE[status]}>{CHECK_OUT_STATUS_LABEL[status]}</Badge>;
}

export function HalfDayBadge({ isHalfDay }: { isHalfDay: boolean }) {
  if (!isHalfDay) return null;
  return <Badge tone="red">Half Day</Badge>;
}

const SPECIAL_DAY_STATUS_LABEL: Record<SpecialDayStatus, string> = {
  holiday_worked: "Worked on Holiday",
  weekly_off_worked: "Worked on Weekly Off",
};

const SPECIAL_DAY_STATUS_CLASSES: Record<SpecialDayStatus, string> = {
  holiday_worked: "bg-teal-50 text-teal-700 ring-teal-600/20",
  weekly_off_worked: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
};

export function SpecialDayStatusBadge({ status }: { status: SpecialDayStatus | null | undefined }) {
  if (!status) return null;
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        SPECIAL_DAY_STATUS_CLASSES[status]
      )}
    >
      {SPECIAL_DAY_STATUS_LABEL[status]}
    </span>
  );
}

/** Shows special off-day status when set, otherwise the regular day status. */
const MANUAL_STATUS_LABEL: Record<ManualAttendanceStatus, string> = {
  present: "Present",
  half_day: "Half Day",
  absent: "Absent",
  leave: "Leave",
  holiday: "Holiday",
  weekly_off: "Weekly Off",
};

const MANUAL_STATUS_TONE: Record<ManualAttendanceStatus, Tone> = {
  present: "green",
  half_day: "amber",
  absent: "red",
  leave: "blue",
  holiday: "blue",
  weekly_off: "slate",
};

export function AttendanceDayBadge({
  dayStatus,
  specialDayStatus,
  adminMarkStatus,
}: {
  dayStatus: DayStatus | null | undefined;
  specialDayStatus?: SpecialDayStatus | null;
  adminMarkStatus?: ManualAttendanceStatus | null;
}) {
  if (adminMarkStatus) {
    return (
      <Badge tone={MANUAL_STATUS_TONE[adminMarkStatus]}>
        {MANUAL_STATUS_LABEL[adminMarkStatus]} (manual)
      </Badge>
    );
  }
  if (specialDayStatus) {
    return <SpecialDayStatusBadge status={specialDayStatus} />;
  }
  return <DayStatusBadge status={dayStatus ?? null} />;
}
