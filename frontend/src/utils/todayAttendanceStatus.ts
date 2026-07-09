import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Briefcase, CheckCircle2, UserX } from "lucide-react";
import type { AttendanceRecord, DayStatus, SpecialDayStatus, TimingRules } from "@/types";

export type TodayAttendanceDisplayStatus =
  | "working"
  | "present"
  | "half_day"
  | "absent"
  | "holiday_worked"
  | "weekly_off_worked";

export interface AttendanceHourThresholds {
  minHoursPresent: number;
  minHoursHalfDay: number;
}

export interface TodayStatusPresentation {
  status: TodayAttendanceDisplayStatus;
  label: string;
  tone: "green" | "amber" | "red";
  Icon: LucideIcon;
}

const STATUS_PRESENTATIONS: Record<
  TodayAttendanceDisplayStatus,
  Omit<TodayStatusPresentation, "status">
> = {
  working: {
    label: "Working",
    tone: "green",
    Icon: Briefcase,
  },
  present: {
    label: "Present",
    tone: "green",
    Icon: CheckCircle2,
  },
  half_day: {
    label: "Half Day",
    tone: "amber",
    Icon: AlertTriangle,
  },
  absent: {
    label: "Absent",
    tone: "red",
    Icon: UserX,
  },
  holiday_worked: {
    label: "Worked on Holiday",
    tone: "green",
    Icon: CheckCircle2,
  },
  weekly_off_worked: {
    label: "Worked on Weekly Off",
    tone: "green",
    Icon: CheckCircle2,
  },
};

function hhmm(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function isAtOrPastTime(now: Date, cutoff: string): boolean {
  return hhmm(now) >= cutoff;
}

function toPresentation(status: TodayAttendanceDisplayStatus): TodayStatusPresentation {
  return { status, ...STATUS_PRESENTATIONS[status] };
}

function classifyDayStatusFromMinutes(
  totalMinutes: number | null | undefined,
  thresholds: AttendanceHourThresholds
): DayStatus {
  const halfDayMinutes = Math.round(thresholds.minHoursHalfDay * 60);
  const fullDayMinutes = Math.round(thresholds.minHoursPresent * 60);

  if (totalMinutes === null || totalMinutes === undefined || totalMinutes < halfDayMinutes) {
    return "absent";
  }
  if (totalMinutes < fullDayMinutes) {
    return "half_day";
  }
  return "present";
}

function resolveFinalDayStatus(
  record: AttendanceRecord,
  thresholds: AttendanceHourThresholds | null
): DayStatus {
  if (record.day_status) {
    return record.day_status;
  }
  if (thresholds) {
    return classifyDayStatusFromMinutes(record.total_minutes, thresholds);
  }
  return "absent";
}

function resolveSpecialDayPresentation(
  specialDayStatus: SpecialDayStatus
): TodayStatusPresentation {
  return toPresentation(specialDayStatus);
}

function resolveFinalAttendanceStatus(
  record: AttendanceRecord,
  thresholds: AttendanceHourThresholds | null
): TodayStatusPresentation {
  if (record.special_day_status) {
    return resolveSpecialDayPresentation(record.special_day_status);
  }
  const dayStatus = resolveFinalDayStatus(record, thresholds);
  if (dayStatus === "present") return toPresentation("present");
  if (dayStatus === "half_day") return toPresentation("half_day");
  return toPresentation("absent");
}

export function resolveTodayAttendanceStatus(
  attendance: AttendanceRecord | null,
  rules: TimingRules | null,
  thresholds: AttendanceHourThresholds | null,
  now: Date = new Date()
): TodayStatusPresentation | null {
  if (!attendance) {
    const closingCutoff = rules?.checkoutStandardTime ?? rules?.halfDayCutoff;
    if (!closingCutoff || !isAtOrPastTime(now, closingCutoff)) {
      return null;
    }
    return toPresentation("absent");
  }

  if (attendance.status === "checked_in") {
    if (attendance.special_day_status) {
      return resolveSpecialDayPresentation(attendance.special_day_status);
    }
    if (attendance.is_half_day || attendance.check_in_status === "half_day") {
      return toPresentation("half_day");
    }
    return toPresentation("working");
  }

  if (attendance.status === "checked_out") {
    return resolveFinalAttendanceStatus(attendance, thresholds);
  }

  return toPresentation("absent");
}

export function getTodayStatusToneClasses(tone: TodayStatusPresentation["tone"]): {
  container: string;
  iconWrap: string;
  label: string;
} {
  switch (tone) {
    case "green":
      return {
        container: "border-emerald-200 bg-emerald-50/80",
        iconWrap: "text-emerald-600",
        label: "text-emerald-900",
      };
    case "amber":
      return {
        container: "border-amber-200 bg-amber-50/80",
        iconWrap: "text-amber-600",
        label: "text-amber-900",
      };
    case "red":
      return {
        container: "border-red-200 bg-red-50/80",
        iconWrap: "text-red-600",
        label: "text-red-900",
      };
    default:
      return {
        container: "border-slate-200 bg-slate-50",
        iconWrap: "text-slate-600",
        label: "text-slate-900",
      };
  }
}
