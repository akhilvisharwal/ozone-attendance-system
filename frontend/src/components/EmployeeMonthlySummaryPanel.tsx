import clsx from "clsx";
import {
  Award,
  CalendarCheck,
  CalendarX,
  Clock,
  Flame,
  Timer,
  TrendingUp,
} from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import type { MonthlySummary } from "@/types";
import { formatMinutesAsHours } from "@/utils/format";
import type { ExtendedMonthlyStats, PerformanceLevel } from "@/utils/employeeAttendanceStats";

const PERFORMANCE_STYLES: Record<
  PerformanceLevel,
  { ring: string; bg: string; text: string; bar: string }
> = {
  excellent: {
    ring: "ring-emerald-200",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    bar: "bg-emerald-500",
  },
  good: {
    ring: "ring-sky-200",
    bg: "bg-sky-50",
    text: "text-sky-700",
    bar: "bg-sky-500",
  },
  average: {
    ring: "ring-amber-200",
    bg: "bg-amber-50",
    text: "text-amber-700",
    bar: "bg-amber-500",
  },
  needs_improvement: {
    ring: "ring-rose-200",
    bg: "bg-rose-50",
    text: "text-rose-700",
    bar: "bg-rose-500",
  },
};

interface EmployeeMonthlySummaryPanelProps {
  label: string;
  summary: MonthlySummary | null;
  extended: ExtendedMonthlyStats | null;
  loading?: boolean;
}

function StatTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: "emerald" | "rose" | "amber" | "violet" | "slate" | "teal" | "orange" | "indigo";
}) {
  const accentClass =
    accent === "emerald"
      ? "text-emerald-700"
      : accent === "rose"
        ? "text-rose-600"
        : accent === "amber"
          ? "text-amber-600"
          : accent === "violet"
            ? "text-violet-600"
            : accent === "teal"
              ? "text-teal-600"
              : accent === "orange"
                ? "text-orange-600"
                : accent === "indigo"
                  ? "text-indigo-600"
                  : "text-slate-900";

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-2.5 py-3 sm:px-3">
      <p className="truncate text-[10px] font-medium uppercase tracking-wide text-slate-400 sm:text-[11px]">
        {label}
      </p>
      <p className={clsx("mt-1 text-lg font-semibold tabular-nums sm:text-xl", accentClass)}>{value}</p>
    </div>
  );
}

export function EmployeeMonthlySummaryPanel({
  label,
  summary,
  extended,
  loading,
}: EmployeeMonthlySummaryPanelProps) {
  return (
    <Card className="h-full min-w-0 overflow-hidden">
      <CardHeader title="Monthly Summary" subtitle={label} />
      <CardBody className="min-w-0 space-y-5">
        {loading ? (
          <Spinner label="Loading summary…" />
        ) : !summary || !extended ? (
          <p className="text-sm text-slate-500">No summary data for this month.</p>
        ) : (
          <>
            <div
              className={clsx(
                "min-w-0 overflow-hidden rounded-2xl p-3 ring-1 sm:p-4",
                PERFORMANCE_STYLES[extended.performanceLevel].ring,
                PERFORMANCE_STYLES[extended.performanceLevel].bg
              )}
            >
              <div className="flex min-w-0 items-start justify-between gap-2 sm:gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Performance
                  </p>
                  <p
                    className={clsx(
                      "mt-1 text-base font-semibold sm:text-lg",
                      PERFORMANCE_STYLES[extended.performanceLevel].text
                    )}
                  >
                    {extended.performanceLabel}
                  </p>
                </div>
                <div
                  className={clsx(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/80 sm:h-10 sm:w-10",
                    PERFORMANCE_STYLES[extended.performanceLevel].text
                  )}
                >
                  <Award className="h-5 w-5" aria-hidden="true" />
                </div>
              </div>
              <div className="mt-4 min-w-0">
                <div className="mb-1.5 flex min-w-0 items-center justify-between gap-2 text-xs text-slate-600">
                  <span className="inline-flex min-w-0 items-center gap-1">
                    <TrendingUp className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    Attendance
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">{summary.attendancePercentage}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/70">
                  <div
                    className={clsx(
                      "h-full max-w-full rounded-full transition-all",
                      PERFORMANCE_STYLES[extended.performanceLevel].bar
                    )}
                    style={{ width: `${Math.min(summary.attendancePercentage, 100)}%` }}
                  />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                <span className="inline-flex items-center gap-1">
                  <Flame className="h-3.5 w-3.5 text-orange-500" aria-hidden="true" />
                  {extended.attendanceStreak}-day streak
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                  {summary.lateCheckIns} late check-in{summary.lateCheckIns === 1 ? "" : "s"}
                </span>
              </div>
            </div>

            <div className="min-w-0">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Attendance
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <StatTile label="Working Days" value={summary.workingDays} />
                <StatTile label="Present" value={summary.present} accent="emerald" />
                <StatTile label="Absent" value={summary.absent} accent="rose" />
                <StatTile label="Half Days" value={summary.halfDay} accent="amber" />
                <StatTile label="Weekly Offs" value={summary.weeklyOff} />
                <StatTile label="Holidays" value={summary.holidays} accent="violet" />
                <StatTile label="Late Check-Ins" value={summary.lateCheckIns} accent="orange" />
                <StatTile label="Worked on Holidays" value={summary.holidayWorked} accent="teal" />
                <StatTile label="WO Worked" value={summary.weeklyOffWorked} accent="indigo" />
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Hours &amp; Timing
              </p>
              <div className="grid grid-cols-2 gap-2">
                <StatTile
                  label="Total Hours"
                  value={formatMinutesAsHours(summary.totalMinutes)}
                />
                <StatTile
                  label="Overtime"
                  value={formatMinutesAsHours(extended.overtimeMinutes)}
                  accent="indigo"
                />
                <StatTile
                  label="Avg Check-In"
                  value={extended.avgCheckInTime ?? "—"}
                />
                <StatTile
                  label="Avg Check-Out"
                  value={extended.avgCheckOutTime ?? "—"}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <CalendarCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Synced with your attendance records
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Timer className="h-3.5 w-3.5" aria-hidden="true" />
                Updates when you check in or out
              </span>
              {summary.leave > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <CalendarX className="h-3.5 w-3.5" aria-hidden="true" />
                  {summary.leave} leave day{summary.leave === 1 ? "" : "s"}
                </span>
              )}
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}
