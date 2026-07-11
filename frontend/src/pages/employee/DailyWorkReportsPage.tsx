import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { ContentSkeleton, EmptyState } from "@/components/ui/Spinner";
import { WorkStatusBadge } from "@/components/ui/Badge";
import { CrossfadeSwitch } from "@/components/ui/CrossfadeSwitch";
import { AttendanceDetailModal } from "@/components/AttendanceDetailModal";
import * as attendanceApi from "@/api/attendance";
import type { AttendanceRecord } from "@/types";
import { formatDate } from "@/utils/format";

export function DailyWorkReportsPage() {
  const [items, setItems] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AttendanceRecord | null>(null);

  useEffect(() => {
    attendanceApi
      .myHistory({ limit: 50 })
      .then((res) => setItems(res.items.filter((item) => item.status === "checked_out")))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-w-0 overflow-x-hidden">
      <PageHeader title="My Daily Work Reports" subtitle="Work summaries you submitted at check-out" />

      <Card className="min-w-0 overflow-hidden">
        <CrossfadeSwitch state={loading ? "loading" : "content"}>
        {loading ? (
          <ContentSkeleton />
        ) : items.length === 0 ? (
          <EmptyState title="No work reports yet" description="Reports appear here after you check out" />
        ) : (
          <div className="divide-y divide-slate-100">
            {items.map((item) => (
              <button
                key={item.id}
                onClick={() => setSelected(item)}
                className="flex w-full flex-col gap-1.5 px-5 py-4 text-left hover:bg-slate-50"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-900">{formatDate(item.attendance_date)}</span>
                  <WorkStatusBadge status={item.work_status} />
                </div>
                <p className="text-sm text-slate-500">{item.site_name ?? "No project specified"}</p>
                <p className="line-clamp-2 text-sm text-slate-600">{item.work_summary}</p>
              </button>
            ))}
          </div>
        )}
        </CrossfadeSwitch>
      </Card>

      <AttendanceDetailModal attendance={selected} onClose={() => setSelected(null)} showLocationDetails={false} />
    </div>
  );
}
