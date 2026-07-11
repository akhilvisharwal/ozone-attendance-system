import { useCallback, useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { ContentSkeleton, EmptyState } from "@/components/ui/Spinner";
import { AttendanceRecordList } from "@/components/AttendanceRecordList";
import { CrossfadeSwitch } from "@/components/ui/CrossfadeSwitch";
import { Input, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { AttendanceDetailModal } from "@/components/AttendanceDetailModal";
import { ManualAttendanceModal } from "@/components/ManualAttendanceModal";
import { EmployeeCombobox } from "@/components/EmployeeCombobox";
import * as attendanceApi from "@/api/attendance";
import type { AdminAttendanceFilterStatus } from "@/api/attendance";
import { extractErrorMessage } from "@/api/client";
import type { AdminAttendanceRow } from "@/types";
import { usePermissions } from "@/auth/usePermissions";
import type { ChronologicalSort } from "@/utils/chronologicalSort";

interface FilterState {
  employeeId: string;
  from: string;
  to: string;
  status: AdminAttendanceFilterStatus | "";
  sort: ChronologicalSort;
}

const FILTER_CONTROL_CLASS =
  "min-h-[42px] sm:min-h-[38px]";

/** Today's date in the user's local timezone (YYYY-MM-DD for date inputs). */
function todayLocalDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function defaultDayFilters(): FilterState {
  const today = todayLocalDateString();
  return {
    employeeId: "",
    from: today,
    to: today,
    status: "",
    sort: "oldest",
  };
}

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
    sort: filters.sort,
  };
}

export function AttendanceRecordsPage() {
  const { can } = usePermissions();
  const [items, setItems] = useState<AdminAttendanceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AdminAttendanceRow | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [filterError, setFilterError] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const limit = 25;

  const [employeeId, setEmployeeId] = useState("");
  const [from, setFrom] = useState(() => todayLocalDateString());
  const [to, setTo] = useState(() => todayLocalDateString());
  const [status, setStatus] = useState<AdminAttendanceFilterStatus | "">("");
  const [sortOrder, setSortOrder] = useState<ChronologicalSort>("oldest");
  const [day, setDay] = useState(() => todayLocalDateString());

  const requestIdRef = useRef(0);

  const currentFilters = (): FilterState => ({
    employeeId,
    from,
    to,
    status,
    sort: sortOrder,
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
    fetchRecords(currentFilters(), 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchRecords, sortOrder]);

  function applyFilters() {
    fetchRecords(currentFilters(), 1);
  }

  function clearFilters() {
    const today = todayLocalDateString();
    setEmployeeId("");
    setFrom(today);
    setTo(today);
    setStatus("");
    setSortOrder("oldest");
    setDay(today);
    setFilterError(null);
    setFetchError(null);
    fetchRecords(defaultDayFilters(), 1);
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

  return (
    <div>
      <PageHeader
        title="Employee Attendance"
        subtitle="Browse and filter all attendance records"
        action={
          can("manualAttendance") ? (
            <Button onClick={() => setManualOpen(true)}>Add Manual Entry</Button>
          ) : can("editAttendance") ? (
            <Button onClick={() => setManualOpen(true)}>Edit Attendance</Button>
          ) : undefined
        }
      />

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

        <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 sm:items-end xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.1fr)_auto] xl:gap-3">
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

          <div className="sm:col-span-2 xl:col-span-1">
            <Select
              label="Sort"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as ChronologicalSort)}
              className={FILTER_CONTROL_CLASS}
            >
              <option value="oldest">Oldest First</option>
              <option value="newest">Newest First</option>
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
        <CrossfadeSwitch state={loading ? "loading" : "content"}>
        {loading ? (
          <ContentSkeleton />
        ) : items.length === 0 ? (
          <EmptyState title="No attendance records found" />
        ) : (
          <>
            <AttendanceRecordList
              records={items}
              startIndex={(page - 1) * limit}
              onRecordClick={setSelected}
            />

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
        </CrossfadeSwitch>
      </Card>

      <AttendanceDetailModal attendance={selected} onClose={() => setSelected(null)} />

      <ManualAttendanceModal
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        onSaved={() => fetchRecords(currentFilters(), page)}
      />
    </div>
  );
}
