import { useCallback, useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Spinner, EmptyState } from "@/components/ui/Spinner";
import { AttendanceStatusBadge, WorkStatusBadge, DayStatusBadge } from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { AttendanceDetailModal } from "@/components/AttendanceDetailModal";
import { EmployeeCombobox } from "@/components/EmployeeCombobox";
import { ResponsiveTable, type Column } from "@/components/ui/ResponsiveTable";
import * as attendanceApi from "@/api/attendance";
import type { AdminAttendanceFilterStatus } from "@/api/attendance";
import { extractErrorMessage } from "@/api/client";
import type { AdminAttendanceRow } from "@/types";
import { formatDate, formatMinutesAsHours, formatTime } from "@/utils/format";
import { formatLocationSummary } from "@/utils/location";

interface FilterState {
  employeeId: string;
  from: string;
  to: string;
  status: AdminAttendanceFilterStatus | "";
}

const EMPTY_FILTERS: FilterState = {
  employeeId: "",
  from: "",
  to: "",
  status: "",
};

const FILTER_CONTROL_CLASS =
  "min-h-[42px] sm:min-h-[38px]";

function validateDateRange(from: string, to: string): string | null {
  if (from && to && from > to) {
    return "The From date must be on or before the To date.";
  }
  return null;
}

function toQueryFilters(filters: FilterState): attendanceApi.AdminListParams {
  return {
    employeeId: filters.employeeId || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
    status: filters.status || undefined,
  };
}

export function AttendanceRecordsPage() {
  const [items, setItems] = useState<AdminAttendanceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AdminAttendanceRow | null>(null);
  const [page, setPage] = useState(1);
  const [filterError, setFilterError] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const limit = 25;

  const [employeeId, setEmployeeId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState<AdminAttendanceFilterStatus | "">("");
  const [day, setDay] = useState("");

  const requestIdRef = useRef(0);

  const currentFilters = (): FilterState => ({
    employeeId,
    from,
    to,
    status,
  });

  const fetchRecords = useCallback(
    async (filters: FilterState, nextPage: number) => {
      const dateError = validateDateRange(filters.from, filters.to);
      if (dateError) {
        setFilterError(dateError);
        setFetchError(null);
        setItems([]);
        setTotal(0);
        setLoading(false);
        return;
      }

      setFilterError(null);
      setFetchError(null);

      const requestId = ++requestIdRef.current;
      setLoading(true);
      setItems([]);
      setTotal(0);

      try {
        const res = await attendanceApi.adminListAttendance({
          ...toQueryFilters(filters),
          page: nextPage,
          limit,
        });

        if (requestId !== requestIdRef.current) return;

        setItems(res.items);
        setTotal(res.total);
        setPage(nextPage);
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        setItems([]);
        setTotal(0);
        setFetchError(extractErrorMessage(err, "Could not load attendance records."));
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [limit]
  );

  useEffect(() => {
    fetchRecords(EMPTY_FILTERS, 1);
  }, [fetchRecords]);

  function applyFilters() {
    fetchRecords(currentFilters(), 1);
  }

  function clearFilters() {
    setEmployeeId("");
    setFrom("");
    setTo("");
    setStatus("");
    setDay("");
    setFilterError(null);
    setFetchError(null);
    fetchRecords(EMPTY_FILTERS, 1);
  }

  function viewDay(date: string) {
    const nextFilters: FilterState = {
      ...currentFilters(),
      from: date,
      to: date,
    };
    setDay(date);
    setFrom(date);
    setTo(date);
    fetchRecords(nextFilters, 1);
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const columns: Column<AdminAttendanceRow>[] = [
    {
      header: "Employee",
      primary: true,
      cell: (row) => (
        <div>
          <p className="font-medium text-slate-900">{row.employee_name}</p>
          <p className="text-xs text-slate-400">{row.employee_code}</p>
        </div>
      ),
    },
    { header: "Date", cell: (row) => formatDate(row.attendance_date) },
    { header: "Check-in", cell: (row) => formatTime(row.check_in_time) },
    {
      header: "Check-in Location",
      cell: (row) => (
        <span className="block max-w-[12rem] truncate text-sm text-slate-600" title={row.check_in_address ?? undefined}>
          {formatLocationSummary(row.check_in_address, row.check_in_latitude, row.check_in_longitude)}
        </span>
      ),
    },
    { header: "Check-out", cell: (row) => formatTime(row.check_out_time) },
    {
      header: "Check-out Location",
      cell: (row) => (
        <span className="block max-w-[12rem] truncate text-sm text-slate-600" title={row.check_out_address ?? undefined}>
          {formatLocationSummary(row.check_out_address, row.check_out_latitude, row.check_out_longitude)}
        </span>
      ),
    },
    { header: "Hours", cell: (row) => formatMinutesAsHours(row.total_minutes) },
    { header: "Attendance", cell: (row) => <DayStatusBadge status={row.day_status} /> },
    { header: "Project", cell: (row) => row.site_name ?? "-" },
    { header: "Work Status", cell: (row) => <WorkStatusBadge status={row.work_status} /> },
    { header: "Status", cell: (row) => <AttendanceStatusBadge status={row.status} /> },
  ];

  return (
    <div>
      <PageHeader title="Employee Attendance" subtitle="Browse and filter all attendance records" />

      <Card className="mb-4">
        <div className="flex flex-col gap-2 border-b border-slate-100 p-4 sm:flex-row sm:items-end sm:gap-3">
          <Input
            label="Jump to a specific day"
            type="date"
            value={day}
            onChange={(e) => {
              const value = e.target.value;
              setDay(value);
              if (value) viewDay(value);
            }}
            className="sm:w-56"
          />
          <span className="text-xs text-slate-400 sm:pb-2.5">
            Pick a date to instantly view that day&apos;s attendance.
          </span>
        </div>

        {(filterError || fetchError) && (
          <div className="border-b border-slate-100 px-4 pt-4">
            <Alert variant="error">{filterError ?? fetchError}</Alert>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 sm:items-end xl:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)_auto] xl:gap-3">
          <div className="sm:col-span-2 xl:col-span-1">
            <EmployeeCombobox
              label="Employee"
              value={employeeId}
              onChange={setEmployeeId}
              hideHint
              className="w-full"
            />
          </div>

          <div>
            <Input
              label="From"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={FILTER_CONTROL_CLASS}
            />
          </div>

          <div>
            <Input
              label="To"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className={FILTER_CONTROL_CLASS}
            />
          </div>

          <div className="sm:col-span-2 xl:col-span-1">
            <Select
              label="Status"
              value={status}
              onChange={(e) => setStatus(e.target.value as AdminAttendanceFilterStatus | "")}
              className={FILTER_CONTROL_CLASS}
            >
              <option value="">All</option>
              <option value="present">Present</option>
              <option value="half_day">Half Day</option>
              <option value="absent">Absent</option>
              <option value="pending">Pending</option>
              <option value="checked_in">Checked In</option>
              <option value="checked_out">Checked Out</option>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2 xl:col-span-1">
            <span className="hidden text-sm font-medium leading-5 text-slate-700 xl:block xl:invisible" aria-hidden="true">
              Actions
            </span>
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={applyFilters} variant="outline" className="w-full whitespace-nowrap">
                Apply Filters
              </Button>
              <Button onClick={clearFilters} variant="ghost" className="w-full whitespace-nowrap">
                Clear Filters
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        {loading ? (
          <Spinner />
        ) : items.length === 0 ? (
          <EmptyState title="No attendance records found" />
        ) : (
          <>
            <ResponsiveTable columns={columns} data={items} rowKey={(row) => row.id} onRowClick={setSelected} />

            <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-500 sm:flex-row lg:px-5">
              <span>
                Page {page} of {totalPages} &middot; {total} records
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1 || loading}
                  onClick={() => fetchRecords(currentFilters(), page - 1)}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= totalPages || loading}
                  onClick={() => fetchRecords(currentFilters(), page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>

      <AttendanceDetailModal attendance={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
