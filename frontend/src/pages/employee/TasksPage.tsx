import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, List, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Spinner, EmptyState } from "@/components/ui/Spinner";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { TaskAnalyticsCards } from "@/components/tasks/TaskAnalyticsCards";
import { TaskCalendar } from "@/components/tasks/TaskCalendar";
import { TaskDetailModal } from "@/components/tasks/TaskDetailModal";
import * as tasksApi from "@/api/tasks";
import type { TaskSortOrder } from "@/api/tasks";
import type { Task, TaskAnalytics, TaskStatus } from "@/types";
import { formatDate } from "@/utils/format";

const STATUS_LABELS: Record<TaskStatus, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  on_hold: "On Hold",
  completed: "Completed",
};

type ViewMode = "list" | "calendar";

export function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [analytics, setAnalytics] = useState<TaskAnalytics | null>(null);
  const [calendarTasks, setCalendarTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("list");
  const [filterStatus, setFilterStatus] = useState<TaskStatus | "">("");
  const [filterOverdue, setFilterOverdue] = useState(false);
  const [sortOrder, setSortOrder] = useState<TaskSortOrder>("newest");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [error, setError] = useState<string | null>(null);

  const calendarRange = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const from = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const to = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    return { from, to };
  }, [calendarMonth]);

  function load() {
    setLoading(true);
    setError(null);
    Promise.all([
      tasksApi.listMyTasks({
        status: filterStatus || undefined,
        overdue: filterOverdue,
        sort: sortOrder,
      }),
      tasksApi.getMyTaskAnalytics(),
      tasksApi.getMyTaskCalendar(calendarRange.from, calendarRange.to),
    ])
      .then(([taskList, stats, calTasks]) => {
        setTasks(taskList);
        setAnalytics(stats);
        setCalendarTasks(calTasks);
      })
      .catch(() => setError("Failed to load tasks"))
      .finally(() => setLoading(false));
  }

  useEffect(load, [filterStatus, filterOverdue, sortOrder, calendarRange.from, calendarRange.to]);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        load();
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [filterStatus, filterOverdue, sortOrder, calendarRange.from, calendarRange.to]);

  return (
    <div className="space-y-4">
      <PageHeader title="My Tasks" subtitle="View assigned tasks, update progress, and request extensions" />

      {error && <Alert variant="error">{error}</Alert>}

      <TaskAnalyticsCards analytics={analytics} />

      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:max-w-xl lg:grid-cols-3">
              <Select label="Status" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as TaskStatus | "")}>
                <option value="">All statuses</option>
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
              <Select label="Sort" value={sortOrder} onChange={(e) => setSortOrder(e.target.value as TaskSortOrder)}>
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
              </Select>
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-slate-700 sm:invisible" aria-hidden="true">
                  Filter
                </span>
                <label className="flex min-h-[38px] items-center gap-2 text-sm text-slate-600 sm:min-h-[38px]">
                  <input type="checkbox" checked={filterOverdue} onChange={(e) => setFilterOverdue(e.target.checked)} />
                  Overdue only
                </label>
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button variant={view === "list" ? "primary" : "outline"} onClick={() => setView("list")} icon={<List className="h-4 w-4" />}>
                List
              </Button>
              <Button variant={view === "calendar" ? "primary" : "outline"} onClick={() => setView("calendar")} icon={<CalendarDays className="h-4 w-4" />}>
                Calendar
              </Button>
            </div>
          </div>
        </div>

        {loading ? (
          <Spinner />
        ) : view === "calendar" ? (
          <div className="p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <TaskCalendar tasks={calendarTasks} month={calendarMonth} />
          </div>
        ) : tasks.length === 0 ? (
          <EmptyState title="No tasks assigned" description="New tasks from your administrator will appear here instantly." />
        ) : (
          <div className="divide-y divide-slate-100">
            {tasks.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => setSelectedTaskId(task.id)}
                className="block w-full px-4 py-4 text-left transition-colors hover:bg-slate-50 sm:px-5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-slate-900">{task.title}</p>
                  <Badge tone={task.priority === "high" ? "red" : task.priority === "medium" ? "amber" : "slate"}>
                    {task.priority}
                  </Badge>
                  <Badge tone={task.status === "completed" ? "green" : task.status === "in_progress" ? "blue" : task.status === "on_hold" ? "amber" : "slate"}>
                    {STATUS_LABELS[task.status]}
                  </Badge>
                  {task.is_overdue && task.status !== "completed" && <Badge tone="red">Overdue</Badge>}
                  {(task.assignee_count ?? 0) > 1 && (
                    <Badge tone="blue">
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        Group · {task.assignee_count} members
                      </span>
                    </Badge>
                  )}
                </div>
                {task.description && <p className="mt-1 line-clamp-2 text-sm text-slate-500">{task.description}</p>}
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-400">
                  {task.site_name && <span>Site: {task.site_name}</span>}
                  <span>Due: {formatDate(task.effective_due_date ?? task.due_date ?? "")}</span>
                  {task.assigned_by_name && task.assigned_by !== task.employee_id && (
                    <span>Assigned by {task.assigned_by_name}</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>

      <TaskDetailModal
        taskId={selectedTaskId}
        mode="employee"
        open={Boolean(selectedTaskId)}
        onClose={() => setSelectedTaskId(null)}
        onUpdated={() => load()}
      />
    </div>
  );
}
