import clsx from "clsx";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardBody } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { Button } from "@/components/ui/Button";
import { MonthPicker } from "@/components/ui/MonthPicker";
import type { MonthlyCellStatus, MonthlyGrid } from "@/types";
import { formatMinutesAsHours, todayIso } from "@/utils/format";
import { shiftMonthString } from "@/utils/employeeAttendanceStats";

const STATUS_META: Record<MonthlyCellStatus, { label: string; cell: string; code: string }> = {
  present: { label: "Present", cell: "bg-emerald-500 text-white", code: "P" },
  half_day: { label: "Half Day", cell: "bg-amber-400 text-slate-900", code: "H" },
  absent: { label: "Absent", cell: "bg-rose-500 text-white", code: "A" },
  leave: { label: "Leave", cell: "bg-sky-500 text-white", code: "L" },
  weekly_off: { label: "Weekly Off", cell: "bg-slate-200 text-slate-500", code: "WO" },
  holiday: { label: "Holiday", cell: "bg-violet-500 text-white", code: "HO" },
  holiday_worked: { label: "Worked on Holiday", cell: "bg-teal-600 text-white", code: "HW" },
  weekly_off_worked: { label: "Worked on Weekly Off", cell: "bg-indigo-600 text-white", code: "WW" },
  none: { label: "—", cell: "bg-slate-50 text-slate-300", code: "" },
  not_applicable: { label: "Not Applicable", cell: "bg-white text-slate-200 border border-slate-100", code: "" },
};

interface EmployeeMonthlyCalendarProps {
  month: string;
  onMonthChange: (month: string) => void;
  grid: MonthlyGrid | null;
  loading?: boolean;
}

/** Monthly attendance calendar for employees (presentational). */
export function EmployeeMonthlyCalendar({
  month,
  onMonthChange,
  grid,
  loading,
}: EmployeeMonthlyCalendarProps) {
  const row = grid?.employees[0];

  return (
    <Card className="h-full min-w-0 overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:px-5">
        <div className="min-w-0">
          <h3 className="text-base font-semibold tracking-tight text-slate-900">Attendance Calendar</h3>
          {grid?.label && <p className="mt-0.5 text-sm text-slate-500">{grid.label}</p>}
        </div>
        <div className="flex w-full min-w-0 items-center gap-1 sm:w-auto">
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => onMonthChange(shiftMonthString(month, -1))}
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <MonthPicker
            value={month}
            onChange={onMonthChange}
            emphasis
            className="min-w-0 flex-1 sm:w-[11rem] sm:flex-none"
          />
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => onMonthChange(shiftMonthString(month, 1))}
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <CardBody className="min-w-0">
        {loading ? (
          <Spinner label="Loading calendar…" />
        ) : !row ? (
          <p className="text-sm text-slate-500">No calendar data for this month.</p>
        ) : (
          <>
            {grid!.holidays.length > 0 && (
              <div className="mb-3 rounded-lg border border-violet-100 bg-violet-50/60 px-3 py-2 text-xs text-violet-800">
                <span className="font-semibold">Holidays: </span>
                {grid!.holidays.map((h) => `${h.date.slice(8)} ${h.name}`).join(" · ")}
              </div>
            )}
            <div className="grid min-w-0 grid-cols-7 gap-1 sm:gap-1.5">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className="text-center text-[10px] font-semibold uppercase text-slate-400">
                  {d}
                </div>
              ))}
              {Array.from({ length: new Date(grid!.year, grid!.month - 1, 1).getDay() }).map((_, i) => (
                <div key={`pad-${i}`} />
              ))}
              {row.days.map((cell) => {
                const meta = STATUS_META[cell.status];
                const holiday = grid!.holidays.find((h) => h.date === cell.date);
                const isToday = cell.date === todayIso();
                const title = [
                  cell.date,
                  isToday && cell.status === "none" ? "Today — pending check-in" : null,
                  holiday ? `Holiday: ${holiday.name}` : meta.label,
                  cell.totalMinutes ? formatMinutesAsHours(cell.totalMinutes) : null,
                ]
                  .filter(Boolean)
                  .join(" • ");
                return (
                  <div
                    key={cell.day}
                    title={title}
                    className={clsx(
                      "flex aspect-square flex-col items-center justify-center rounded-md text-[10px] font-semibold sm:text-xs",
                      meta.cell,
                      holiday && cell.status === "holiday" && "ring-2 ring-violet-300",
                      isToday && cell.status === "none" && "ring-2 ring-brand-300 ring-offset-1"
                    )}
                  >
                    <span className="text-[9px] opacity-80">{cell.day}</span>
                    <span>{isToday && cell.status === "none" ? "·" : meta.code}</span>
                  </div>
                );
              })}
            </div>
            <CalendarLegend />
          </>
        )}
      </CardBody>
    </Card>
  );
}

function CalendarLegend() {
  const items: MonthlyCellStatus[] = [
    "present",
    "half_day",
    "absent",
    "leave",
    "weekly_off",
    "holiday",
    "holiday_worked",
    "weekly_off_worked",
  ];

  return (
    <div className="mt-4 flex flex-wrap gap-x-3 gap-y-2 border-t border-slate-100 pt-3">
      {items.map((status) => (
        <div key={status} className="flex items-center gap-1.5 text-[10px] text-slate-500">
          <span
            className={clsx(
              "inline-flex h-4 w-4 items-center justify-center rounded text-[8px] font-bold",
              STATUS_META[status].cell
            )}
          >
            {STATUS_META[status].code}
          </span>
          {STATUS_META[status].label}
        </div>
      ))}
    </div>
  );
}
