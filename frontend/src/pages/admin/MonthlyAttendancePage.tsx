import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { CalendarRange, ChevronLeft, ChevronRight, FileSpreadsheet, FileText } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { ContentSkeleton, EmptyState } from "@/components/ui/Spinner";
import { MonthPicker } from "@/components/ui/MonthPicker";
import { Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { FilterBar } from "@/components/ui/ResponsiveTable";
import { CrossfadeSwitch } from "@/components/ui/CrossfadeSwitch";
import { HolidayFormModal } from "@/components/HolidayFormModal";
import { ManualAttendanceModal } from "@/components/ManualAttendanceModal";
import { EmployeeCombobox } from "@/components/EmployeeCombobox";
import * as attendanceApi from "@/api/attendance";
import * as sitesApi from "@/api/sites";
import { extractErrorMessage } from "@/api/client";
import { useToast } from "@/components/ui/Toast";
import type { MonthlyCellStatus, MonthlyGrid, Site } from "@/types";
import { formatMinutesAsHours } from "@/utils/format";
import { usePermissions } from "@/auth/usePermissions";

const WEEKDAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

const STATUS_META: Record<MonthlyCellStatus, { label: string; cell: string; dot: string; code: string }> = {
  present: { label: "Present", cell: "bg-emerald-500 text-white", dot: "bg-emerald-500", code: "P" },
  half_day: { label: "Half Day", cell: "bg-amber-400 text-slate-900", dot: "bg-amber-400", code: "H" },
  absent: { label: "Absent", cell: "bg-rose-500 text-white", dot: "bg-rose-500", code: "A" },
  leave: { label: "Leave", cell: "bg-sky-500 text-white", dot: "bg-sky-500", code: "L" },
  weekly_off: { label: "Weekly Off", cell: "bg-slate-200 text-slate-500", dot: "bg-slate-300", code: "WO" },
  holiday: { label: "Holiday", cell: "bg-violet-500 text-white", dot: "bg-violet-500", code: "HO" },
  holiday_worked: { label: "Worked on Holiday", cell: "bg-teal-600 text-white", dot: "bg-teal-600", code: "HW" },
  weekly_off_worked: { label: "Worked on Weekly Off", cell: "bg-indigo-600 text-white", dot: "bg-indigo-600", code: "WW" },
  none: { label: "—", cell: "bg-slate-50 text-slate-400 hover:bg-slate-100", dot: "bg-slate-100 border border-slate-200", code: "·" },
  not_applicable: { label: "Not Applicable", cell: "bg-white text-slate-300 border border-slate-200 hover:bg-slate-50", dot: "bg-white border border-slate-200", code: "NA" },
};

function currentMonthString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function weekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

export function MonthlyAttendancePage() {
  const { can, isMasterAdmin } = usePermissions();
  const { showToast } = useToast();
  const canEditCell = can("editAttendance") || can("manualAttendance");
  const [month, setMonth] = useState<string>(currentMonthString());
  const [employeeId, setEmployeeId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [statusFilter, setStatusFilter] = useState<MonthlyCellStatus | "">("");

  const [sites, setSites] = useState<Site[]>([]);
  const [grid, setGrid] = useState<MonthlyGrid | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [holidayDate, setHolidayDate] = useState<string | null>(null);
  const [manualTarget, setManualTarget] = useState<{
    employeeId: string;
    date: string;
    status?: MonthlyCellStatus;
  } | null>(null);

  function loadGrid() {
    setLoading(true);
    attendanceApi
      .getMonthlyAttendance({
        month,
        employeeId: employeeId || undefined,
        siteId: siteId || undefined,
      })
      .then(setGrid)
      .catch((err) => {
        setGrid(null);
        showToast(extractErrorMessage(err, "Could not load monthly attendance."), "error");
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    sitesApi.listSites().then(setSites).catch(() => setSites([]));
  }, []);

  useEffect(() => {
    loadGrid();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, employeeId, siteId]);

  async function handleDownload(format: "excel" | "pdf") {
    setDownloading(format);
    try {
      await attendanceApi.downloadMonthlyReport({
        month,
        employeeId: employeeId || undefined,
        siteId: siteId || undefined,
        format,
      });
    } catch (err) {
      showToast(extractErrorMessage(err, `Could not download ${format.toUpperCase()} report.`), "error");
    } finally {
      setDownloading(null);
    }
  }

  const dayNumbers = useMemo(
    () => (grid ? Array.from({ length: grid.daysInMonth }, (_, i) => i + 1) : []),
    [grid]
  );

  return (
    <div>
      <PageHeader
        title="Monthly Attendance"
        subtitle="Day-by-day attendance calendar, summary and downloadable reports"
        icon={<CalendarRange className="h-5 w-5" />}
      />

      {/* Month navigator + filters */}
      <Card className="mb-4">
        <CardBody className="space-y-4">
          <div className="flex items-center justify-center gap-3 sm:justify-start">
            <Button variant="outline" size="sm" onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <MonthPicker
              value={month}
              onChange={setMonth}
              emphasis
              className="w-[11.5rem]"
            />
            <Button variant="outline" size="sm" onClick={() => setMonth((m) => shiftMonth(m, 1))} aria-label="Next month">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="ml-1 hidden text-sm font-semibold text-slate-500 sm:inline">{grid?.label}</span>
          </div>

          <FilterBar>
            <EmployeeCombobox
              label="Employee"
              value={employeeId}
              onChange={setEmployeeId}
              hideHint
            />
            <Select label="Site" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
              <option value="">All sites</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <Select
              label="Highlight status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as MonthlyCellStatus | "")}
            >
              <option value="">Show all</option>
              <option value="present">Present</option>
              <option value="half_day">Half Day</option>
              <option value="absent">Absent</option>
              <option value="leave">Leave</option>
              <option value="weekly_off">Weekly Off</option>
              <option value="holiday">Holiday</option>
              <option value="holiday_worked">Worked on Holiday</option>
              <option value="weekly_off_worked">Worked on Weekly Off</option>
            </Select>
          </FilterBar>

          {grid && grid.holidays.length > 0 && (
            <div className="rounded-lg border border-violet-100 bg-violet-50/60 px-3 py-2 text-xs text-violet-800">
              <span className="font-semibold">Holidays: </span>
              {grid.holidays.map((h) => `${h.date.slice(8)} ${h.name}`).join(" · ")}
            </div>
          )}

          {isMasterAdmin && (
            <p className="text-xs text-slate-400">Tip: click any day number in the calendar header to mark it as a holiday.</p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-slate-500">Download {employeeId ? "employee" : "all"}:</span>
            <Button
              variant="outline"
              size="sm"
              icon={<FileSpreadsheet className="h-4 w-4" />}
              isLoading={downloading === "excel"}
              onClick={() => void handleDownload("excel")}
            >
              Excel
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={<FileText className="h-4 w-4" />}
              isLoading={downloading === "pdf"}
              onClick={() => void handleDownload("pdf")}
            >
              PDF
            </Button>
          </div>

          <Legend />
        </CardBody>
      </Card>

      {/* Calendar grid */}
      <Card className="mb-4">
        <CardHeader title="Attendance Calendar" subtitle={grid?.label} />
        <CrossfadeSwitch state={loading ? "loading" : "content"}>
        {loading ? (
          <ContentSkeleton />
        ) : !grid || grid.employees.length === 0 ? (
          <EmptyState title="No active employees found for this month" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-max border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-20 min-w-40 border-b border-r border-slate-200 bg-slate-50 px-3 py-2 text-left font-semibold text-slate-600 shadow-[8px_0_12px_-12px_rgb(15_23_42/0.35)]">
                    Employee
                  </th>
                  {dayNumbers.map((day) => {
                    const dateStr = `${month}-${String(day).padStart(2, "0")}`;
                    const wd = weekdayOf(dateStr);
                    const weeklyOffColumn = grid?.defaultWeeklyOffDays.includes(wd) ?? false;
                    const holiday = grid?.holidays.find((h) => h.date === dateStr);
                    return (
                      <th
                        key={day}
                        className={clsx(
                          "border-b border-slate-200 px-0 py-1 text-center text-[11px] font-semibold",
                          holiday
                            ? "bg-violet-100 text-violet-700"
                            : weeklyOffColumn
                              ? "bg-slate-100 text-slate-500"
                              : "bg-slate-50 text-slate-500"
                        )}
                        style={{ minWidth: 38 }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            if (!isMasterAdmin) return;
                            setHolidayDate(dateStr);
                          }}
                          disabled={!isMasterAdmin}
                          title={
                            holiday
                              ? `${holiday.name}${holiday.description ? ` — ${holiday.description}` : ""}`
                              : isMasterAdmin
                                ? `Mark ${dateStr} as holiday`
                                : dateStr
                          }
                          className={clsx(
                            "w-full rounded px-0.5 py-0.5 transition",
                            isMasterAdmin && "hover:bg-violet-200/60",
                            !isMasterAdmin && "cursor-default"
                          )}
                        >
                          <div>{day}</div>
                          <div className="truncate text-[8px] font-normal">
                            {holiday ? holiday.name.slice(0, 8) : WEEKDAY_LETTERS[wd]}
                          </div>
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {grid.employees.map((emp) => (
                  <tr key={emp.employeeId} className="hover:bg-slate-50/60">
                    <td className="sticky left-0 z-10 min-w-40 whitespace-nowrap border-b border-r border-slate-100 bg-white px-3 py-2 shadow-[8px_0_12px_-12px_rgb(15_23_42/0.35)]">
                      <p className="font-medium text-slate-900">{emp.name}</p>
                      <p className="text-xs text-slate-400">{emp.employeeCode}</p>
                      {emp.designation && (
                        <p className="text-xs text-slate-500">{emp.designation}</p>
                      )}
                    </td>
                    {emp.days.map((cell) => {
                      const meta = STATUS_META[cell.status];
                      const dimmed = statusFilter && cell.status !== statusFilter;
                      const title = [
                        cell.date,
                        cell.holidayName ? `Holiday: ${cell.holidayName}` : meta.label,
                        cell.totalMinutes ? formatMinutesAsHours(cell.totalMinutes) : null,
                        cell.late ? "Late check-in" : null,
                      ].filter(Boolean).join(" • ");
                      return (
                        <td key={cell.day} className="border-b border-slate-100 p-0.5 text-center">
                          <button
                            type="button"
                            title={
                              canEditCell
                                ? `${title} — Click to edit attendance`
                                : title
                            }
                            disabled={!canEditCell}
                            onClick={() => {
                              if (!canEditCell) return;
                              setManualTarget({
                                employeeId: emp.employeeId,
                                date: cell.date,
                                status: cell.status,
                              });
                            }}
                            className={clsx(
                              "relative mx-auto flex h-9 w-9 items-center justify-center rounded text-[10px] font-semibold transition sm:h-8 sm:w-8",
                              canEditCell && "cursor-pointer hover:ring-2 hover:ring-brand-300 hover:scale-105",
                              !canEditCell && "cursor-default",
                              meta.cell,
                              dimmed && "opacity-20"
                            )}
                          >
                            {meta.code || "·"}
                            {cell.late && cell.status !== "none" && (
                              <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-orange-600 ring-1 ring-white" />
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </CrossfadeSwitch>
      </Card>

      {/* Monthly summary */}
      <Card>
        <CardHeader title="Monthly Summary" subtitle="Per-employee totals for the selected month" />
        <CrossfadeSwitch state={loading ? "loading" : "content"}>
        {loading ? (
          <ContentSkeleton />
        ) : !grid || grid.employees.length === 0 ? (
          <EmptyState title="No summary available" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-max text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="sticky left-0 z-10 min-w-40 bg-slate-50 px-3 py-2 shadow-[8px_0_12px_-12px_rgb(15_23_42/0.35)]">
                    Employee
                  </th>
                  <th className="px-3 py-2 text-center">Present</th>
                  <th className="px-3 py-2 text-center">Half</th>
                  <th className="px-3 py-2 text-center">Absent</th>
                  <th className="px-3 py-2 text-center">Leave</th>
                  <th className="px-3 py-2 text-center">Weekly Off</th>
                  <th className="px-3 py-2 text-center">Holiday</th>
                  <th className="px-3 py-2 text-center">Hol. Worked</th>
                  <th className="px-3 py-2 text-center">WO Worked</th>
                  <th className="px-3 py-2 text-center">Working Days</th>
                  <th className="px-3 py-2 text-center">Total Hours</th>
                  <th className="px-3 py-2 text-center">Attendance %</th>
                  <th className="px-3 py-2 text-center">Late</th>
                </tr>
              </thead>
              <tbody>
                {grid.employees.map((emp) => {
                  const s = emp.summary;
                  return (
                    <tr key={emp.employeeId} className="border-b border-slate-100 hover:bg-slate-50/60">
                      <td className="sticky left-0 bg-white px-3 py-2 shadow-[8px_0_12px_-12px_rgb(15_23_42/0.35)]">
                        <p className="font-medium text-slate-900">{emp.name}</p>
                        <p className="text-xs text-slate-400">{emp.employeeCode}</p>
                        {emp.designation && (
                          <p className="text-xs text-slate-500">{emp.designation}</p>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center font-semibold text-emerald-600">{s.present}</td>
                      <td className="px-3 py-2 text-center font-semibold text-amber-600">{s.halfDay}</td>
                      <td className="px-3 py-2 text-center font-semibold text-rose-600">{s.absent}</td>
                      <td className="px-3 py-2 text-center font-semibold text-sky-600">{s.leave}</td>
                      <td className="px-3 py-2 text-center text-slate-500">{s.weeklyOff}</td>
                      <td className="px-3 py-2 text-center text-violet-600">{s.holidays}</td>
                      <td className="px-3 py-2 text-center text-teal-600">{s.holidayWorked}</td>
                      <td className="px-3 py-2 text-center text-indigo-600">{s.weeklyOffWorked}</td>
                      <td className="px-3 py-2 text-center text-slate-700">{s.workingDays}</td>
                      <td className="px-3 py-2 text-center text-slate-700">{formatMinutesAsHours(s.totalMinutes)}</td>
                      <td className="px-3 py-2 text-center">
                        <span
                          className={clsx(
                            "inline-block rounded-full px-2 py-0.5 text-xs font-semibold",
                            s.attendancePercentage >= 90
                              ? "bg-emerald-50 text-emerald-700"
                              : s.attendancePercentage >= 70
                              ? "bg-amber-50 text-amber-700"
                              : "bg-rose-50 text-rose-700"
                          )}
                        >
                          {s.attendancePercentage}%
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center text-orange-600">{s.lateCheckIns}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        </CrossfadeSwitch>
      </Card>

      <HolidayFormModal
        open={isMasterAdmin && Boolean(holidayDate)}
        initialDate={holidayDate ?? undefined}
        onClose={() => setHolidayDate(null)}
        onSaved={loadGrid}
      />

      <ManualAttendanceModal
        open={Boolean(manualTarget)}
        onClose={() => setManualTarget(null)}
        onSaved={loadGrid}
        initialEmployeeId={manualTarget?.employeeId}
        initialDate={manualTarget?.date}
        initialStatus={manualTarget?.status}
      />
    </div>
  );
}

function Legend() {
  const items: MonthlyCellStatus[] = [
    "present", "half_day", "absent", "leave", "weekly_off", "holiday", "holiday_worked", "weekly_off_worked", "not_applicable", "none",
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 pt-3">
      {items.map((status) => (
        <div key={status} className="flex items-center gap-1.5">
          <span className={clsx("inline-block h-3.5 w-3.5 rounded", STATUS_META[status].dot)} />
          <span className="text-xs text-slate-500">{STATUS_META[status].label}</span>
        </div>
      ))}
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-orange-600" />
        <span className="text-xs text-slate-500">Late check-in</span>
      </div>
    </div>
  );
}
