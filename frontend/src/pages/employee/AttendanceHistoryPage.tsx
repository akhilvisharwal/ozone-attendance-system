import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Spinner, EmptyState } from "@/components/ui/Spinner";
import { AttendanceStatusBadge, DayStatusBadge } from "@/components/ui/Badge";
import { AttendanceDetailModal } from "@/components/AttendanceDetailModal";
import { EmployeeMonthlyCalendar } from "@/components/EmployeeMonthlyCalendar";
import { ResponsiveTable, FilterBar, type Column } from "@/components/ui/ResponsiveTable";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import * as attendanceApi from "@/api/attendance";
import type { AttendanceRecord } from "@/types";
import { formatDate, formatMinutesAsHours, formatTime } from "@/utils/format";

export function AttendanceHistoryPage() {
  const [items, setItems] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState<AttendanceRecord | null>(null);

  function load() {
    setLoading(true);
    attendanceApi
      .myHistory({ from: from || undefined, to: to || undefined, limit: 50 })
      .then((res) => setItems(res.items))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const columns: Column<AttendanceRecord>[] = [
    {
      header: "Date",
      primary: true,
      cell: (item) => <span className="font-medium text-slate-900">{formatDate(item.attendance_date)}</span>,
    },
    { header: "Check-in", cell: (item) => formatTime(item.check_in_time) },
    { header: "Check-out", cell: (item) => formatTime(item.check_out_time) },
    { header: "Hours", cell: (item) => formatMinutesAsHours(item.total_minutes) },
    { header: "Attendance", cell: (item) => <DayStatusBadge status={item.day_status} /> },
    { header: "Status", cell: (item) => <AttendanceStatusBadge status={item.status} /> },
  ];

  return (
    <div>
      <PageHeader title="My Attendance History" subtitle="View your past check-ins and check-outs" />

      <div className="mb-4">
        <EmployeeMonthlyCalendar />
      </div>

      <Card className="mb-4">
        <FilterBar>
          <Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <Button onClick={load} variant="outline" className="sm:self-end">
            Filter
          </Button>
        </FilterBar>
      </Card>

      <Card>
        {loading ? (
          <Spinner />
        ) : items.length === 0 ? (
          <EmptyState title="No attendance records found" description="Try adjusting your date filters" />
        ) : (
          <ResponsiveTable
            columns={columns}
            data={items}
            rowKey={(item) => item.id}
            onRowClick={setSelected}
          />
        )}
      </Card>

      <AttendanceDetailModal attendance={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
