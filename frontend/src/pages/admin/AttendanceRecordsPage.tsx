import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Spinner, EmptyState } from "@/components/ui/Spinner";
import { AttendanceStatusBadge, WorkStatusBadge, DayStatusBadge } from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { AttendanceDetailModal } from "@/components/AttendanceDetailModal";
import { ResponsiveTable, FilterBar, type Column } from "@/components/ui/ResponsiveTable";
import * as attendanceApi from "@/api/attendance";
import * as employeesApi from "@/api/employees";
import type { AdminAttendanceRow, Employee } from "@/types";
import { formatDate, formatMinutesAsHours, formatTime } from "@/utils/format";

export function AttendanceRecordsPage() {
  const [items, setItems] = useState<AdminAttendanceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selected, setSelected] = useState<AdminAttendanceRow | null>(null);
  const [page, setPage] = useState(1);
  const limit = 25;

  const [employeeId, setEmployeeId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("");
  const [day, setDay] = useState("");

  // Jump straight to a single day: set the range to that day and reload.
  function viewDay(date: string) {
    setDay(date);
    setFrom(date);
    setTo(date);
    setLoading(true);
    attendanceApi
      .adminListAttendance({
        employeeId: employeeId || undefined,
        from: date,
        to: date,
        status: (status as "checked_in" | "checked_out" | "") || undefined,
        page: 1,
        limit,
      })
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
        setPage(1);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    employeesApi.listEmployees({ limit: 200 }).then((res) => setEmployees(res.items));
  }, []);

  function load(nextPage = page) {
    setLoading(true);
    attendanceApi
      .adminListAttendance({
        employeeId: employeeId || undefined,
        from: from || undefined,
        to: to || undefined,
        status: (status as "checked_in" | "checked_out" | "") || undefined,
        page: nextPage,
        limit,
      })
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
        setPage(nextPage);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    { header: "Check-out", cell: (row) => formatTime(row.check_out_time) },
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
            onChange={(e) => e.target.value && viewDay(e.target.value)}
            className="sm:w-56"
          />
          <span className="text-xs text-slate-400 sm:pb-2.5">
            Pick a date to instantly view that day's attendance.
          </span>
        </div>
        <FilterBar>
          <Select label="Employee" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">All employees</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} ({e.employee_code})
              </option>
            ))}
          </Select>
          <Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            <option value="checked_in">Checked In</option>
            <option value="checked_out">Checked Out</option>
          </Select>
          <Button onClick={() => load(1)} variant="outline" className="sm:self-end">
            Apply Filters
          </Button>
        </FilterBar>
      </Card>

      <Card>
        {loading ? (
          <Spinner />
        ) : items.length === 0 ? (
          <EmptyState title="No attendance records match your filters" />
        ) : (
          <>
            <ResponsiveTable columns={columns} data={items} rowKey={(row) => row.id} onRowClick={setSelected} />

            <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-500 sm:flex-row lg:px-5">
              <span>
                Page {page} of {totalPages} &middot; {total} records
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => load(page - 1)}>
                  Previous
                </Button>
                <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => load(page + 1)}>
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
