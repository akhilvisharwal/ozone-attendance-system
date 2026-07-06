import { useEffect, useState } from "react";
import clsx from "clsx";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { Button } from "@/components/ui/Button";
import * as attendanceApi from "@/api/attendance";
import type { MonthlyCellStatus, MonthlyGrid } from "@/types";
import { formatMinutesAsHours } from "@/utils/format";

const STATUS_META: Record<MonthlyCellStatus, { label: string; cell: string; code: string }> = {
  present: { label: "Present", cell: "bg-emerald-500 text-white", code: "P" },
  half_day: { label: "Half Day", cell: "bg-amber-400 text-slate-900", code: "H" },
  absent: { label: "Absent", cell: "bg-rose-500 text-white", code: "A" },
  leave: { label: "Leave", cell: "bg-sky-500 text-white", code: "L" },
  weekly_off: { label: "Weekly Off", cell: "bg-slate-200 text-slate-500", code: "WO" },
  holiday: { label: "Holiday", cell: "bg-violet-500 text-white", code: "HO" },
  holiday_worked: { label: "Holiday Worked", cell: "bg-teal-600 text-white", code: "HW" },
  none: { label: "—", cell: "bg-slate-50 text-slate-300", code: "" },
};

function currentMonthString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Compact monthly attendance calendar for employees. */
export function EmployeeMonthlyCalendar({ compact }: { compact?: boolean }) {
  const [month, setMonth] = useState(currentMonthString());
  const [grid, setGrid] = useState<MonthlyGrid | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    attendanceApi.getMyMonthly({ month }).then(setGrid).finally(() => setLoading(false));
  }, [month]);

  const row = grid?.employees[0];

  return (
    <Card>
      <CardHeader
        title="My Attendance Calendar"
        subtitle={grid?.label}
        action={
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value || currentMonthString())}
              className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
            />
            <Button variant="outline" size="sm" onClick={() => setMonth((m) => shiftMonth(m, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        }
      />
      <CardBody>
        {loading ? (
          <Spinner />
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
            <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className="text-center text-[10px] font-semibold uppercase text-slate-400">{d}</div>
              ))}
              {Array.from({ length: new Date(grid!.year, grid!.month - 1, 1).getDay() }).map((_, i) => (
                <div key={`pad-${i}`} />
              ))}
              {row.days.map((cell) => {
                const meta = STATUS_META[cell.status];
                const holiday = grid!.holidays.find((h) => h.date === cell.date);
                const title = [
                  cell.date,
                  holiday ? `Holiday: ${holiday.name}` : meta.label,
                  cell.totalMinutes ? formatMinutesAsHours(cell.totalMinutes) : null,
                ].filter(Boolean).join(" • ");
                return (
                  <div
                    key={cell.day}
                    title={title}
                    className={clsx(
                      "flex aspect-square flex-col items-center justify-center rounded-md text-[10px] font-semibold sm:text-xs",
                      meta.cell,
                      holiday && cell.status === "holiday" && "ring-2 ring-violet-300"
                    )}
                  >
                    <span className="text-[9px] opacity-80">{cell.day}</span>
                    <span>{meta.code}</span>
                  </div>
                );
              })}
            </div>
            {!compact && (
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-600 sm:grid-cols-4">
                <div>Present: <strong>{row.summary.present}</strong></div>
                <div>Absent: <strong>{row.summary.absent}</strong></div>
                <div>Holidays: <strong>{row.summary.holidays}</strong></div>
                <div>Hol. Worked: <strong>{row.summary.holidayWorked}</strong></div>
              </div>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}
