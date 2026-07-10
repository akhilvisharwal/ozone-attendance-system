import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, List, Pencil, Plus, Trash2, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { ContentSkeleton, EmptyState } from "@/components/ui/Spinner";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { Modal, ModalFooterActions } from "@/components/ui/Modal";
import { Alert } from "@/components/ui/Alert";
import { ResponsiveTable, type Column } from "@/components/ui/ResponsiveTable";
import { CrossfadeSwitch } from "@/components/ui/CrossfadeSwitch";
import { EmployeeCombobox } from "@/components/EmployeeCombobox";
import { EmployeeAvatar } from "@/components/EmployeeAvatar";
import { TaskAnalyticsCards } from "@/components/tasks/TaskAnalyticsCards";
import { TaskCalendar } from "@/components/tasks/TaskCalendar";
import { TaskDetailModal } from "@/components/tasks/TaskDetailModal";
import { TaskDeleteConfirmModal } from "@/components/tasks/TaskDeleteConfirmModal";
import * as tasksApi from "@/api/tasks";
import type { TaskSortOrder } from "@/api/tasks";
import * as employeesApi from "@/api/employees";
import * as sitesApi from "@/api/sites";
import type { Employee, Site, TaskAnalytics, TaskGroupSummary, TaskPriority, TaskStatus } from "@/types";
import { extractErrorMessage } from "@/api/client";
import { formatDate, todayIso } from "@/utils/format";
import { usePermissions } from "@/auth/usePermissions";

const STATUS_LABELS: Record<TaskStatus, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  on_hold: "On Hold",
  completed: "Completed",
};

type ViewMode = "list" | "calendar";

function aggregateGroupStatus(group: TaskGroupSummary): TaskStatus {
  const statuses = group.assignees.map((assignee) => assignee.status);
  if (statuses.every((status) => status === "completed")) return "completed";
  if (statuses.some((status) => status === "in_progress")) return "in_progress";
  if (statuses.some((status) => status === "on_hold")) return "on_hold";
  return "not_started";
}

function groupStatusLabel(group: TaskGroupSummary): string {
  if (group.assignee_count === 1) {
    return STATUS_LABELS[group.assignees[0]?.status ?? "not_started"];
  }
  if (group.completed_count === group.assignee_count) return "Completed";
  if (group.completed_count > 0) return `${group.completed_count}/${group.assignee_count} Done`;
  return aggregateGroupStatus(group) === "in_progress"
    ? "In Progress"
    : aggregateGroupStatus(group) === "on_hold"
      ? "On Hold"
      : "Not Started";
}

export function TaskManagementPage() {
  const { can } = usePermissions();
  const [groups, setGroups] = useState<TaskGroupSummary[]>([]);
  const [analytics, setAnalytics] = useState<TaskAnalytics | null>(null);
  const [calendarGroups, setCalendarGroups] = useState<TaskGroupSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("list");
  const [filterEmployee, setFilterEmployee] = useState("");
  const [filterStatus, setFilterStatus] = useState<TaskStatus | "">("");
  const [filterOverdue, setFilterOverdue] = useState(false);
  const [sortOrder, setSortOrder] = useState<TaskSortOrder>("newest");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TaskGroupSummary | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [membersTarget, setMembersTarget] = useState<TaskGroupSummary | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TaskGroupSummary | null>(null);
  const [clearAllOpen, setClearAllOpen] = useState(false);

  const calendarRange = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const from = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const to = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    return { from, to };
  }, [calendarMonth]);

  const calendarTasks = useMemo(
    () =>
      calendarGroups.map((group) => ({
        id: group.group_id,
        employee_id: group.assignees[0]?.employee_id ?? "",
        assigned_by: null,
        attendance_date: group.start_date,
        title: group.assignee_count > 1 ? `${group.title} (${group.assignee_count})` : group.title,
        description: group.description,
        priority: group.priority,
        status: aggregateGroupStatus(group),
        completed_at: null,
        site_id: group.site_id,
        site_name: group.site_name,
        start_date: group.start_date,
        due_date: group.due_date,
        extended_due_date: null,
        effective_due_date: group.effective_due_date,
        expected_duration_days: group.expected_duration_days,
        progress_remarks: null,
        group_id: group.group_id,
        is_overdue: group.is_overdue,
        created_at: group.created_at,
        updated_at: group.updated_at,
      })),
    [calendarGroups]
  );

  function load() {
    setLoading(true);
    setError(null);
    Promise.all([
      tasksApi.adminListTaskGroups({
        employeeId: filterEmployee || undefined,
        status: filterStatus || undefined,
        overdue: filterOverdue,
        sort: sortOrder,
      }),
      tasksApi.adminGetTaskAnalytics(),
      tasksApi.adminGetTaskCalendar(calendarRange.from, calendarRange.to, filterEmployee || undefined),
    ])
      .then(([groupList, stats, calGroups]) => {
        setGroups(groupList);
        setAnalytics(stats);
        setCalendarGroups(calGroups);
      })
      .catch(() => setError("Failed to load tasks"))
      .finally(() => setLoading(false));
  }

  useEffect(load, [filterEmployee, filterStatus, filterOverdue, sortOrder, calendarRange.from, calendarRange.to]);

  async function handleDeleteGroup(group: TaskGroupSummary) {
    setError(null);
    try {
      await tasksApi.adminDeleteTaskGroup(group.group_id);
      setDeleteTarget(null);
      setSelectedGroupId(null);
      load();
    } catch {
      setError("Failed to delete task");
    }
  }

  async function handleClearAll() {
    setError(null);
    try {
      await tasksApi.adminClearAllTasks();
      setClearAllOpen(false);
      setSelectedGroupId(null);
      load();
    } catch {
      setError("Failed to clear all tasks");
    }
  }

  const deleteMessage = deleteTarget
    ? deleteTarget.assignee_count > 1
      ? `Delete "${deleteTarget.title}" for all ${deleteTarget.assignee_count} assigned employees? This cannot be undone.`
      : `Delete "${deleteTarget.title}" for ${deleteTarget.assignees[0]?.employee_name ?? "this employee"}? This cannot be undone.`
    : "";

  const columns: Column<TaskGroupSummary>[] = [
    {
      header: "Employees",
      primary: true,
      cell: (group) => (
        <div className="flex items-center gap-3">
          {group.assignee_count === 1 ? (
            <>
              <EmployeeAvatar
                name={group.assignees[0]?.employee_name ?? "Employee"}
                photoPath={group.assignees[0]?.employee_profile_photo_path}
                size="md"
              />
              <div>
                <p className="font-medium text-slate-900">{group.assignees[0]?.employee_name}</p>
                <p className="text-xs text-slate-400">{group.assignees[0]?.employee_code}</p>
              </div>
            </>
          ) : (
            <div>
              <p className="font-medium text-slate-900">{group.assignee_count} Employees</p>
              <button
                type="button"
                className="mt-0.5 flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
                onClick={(e) => {
                  e.stopPropagation();
                  setMembersTarget(group);
                }}
              >
                <Users className="h-3 w-3" />
                View Members
              </button>
            </div>
          )}
        </div>
      ),
    },
    {
      header: "Task",
      cell: (group) => (
        <div>
          <p className="font-medium text-slate-900">{group.title}</p>
          {group.description && <p className="line-clamp-1 text-xs text-slate-400">{group.description}</p>}
        </div>
      ),
    },
    { header: "Site", cell: (group) => group.site_name ?? "-" },
    { header: "Start", cell: (group) => (group.start_date ? formatDate(group.start_date) : "-") },
    {
      header: "Due",
      cell: (group) => formatDate(group.effective_due_date ?? group.due_date ?? ""),
    },
    {
      header: "Priority",
      cell: (group) => (
        <Badge tone={group.priority === "high" ? "red" : group.priority === "medium" ? "amber" : "slate"}>
          {group.priority}
        </Badge>
      ),
    },
    {
      header: "Status",
      cell: (group) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge
            tone={
              group.completed_count === group.assignee_count
                ? "green"
                : aggregateGroupStatus(group) === "in_progress"
                  ? "blue"
                  : aggregateGroupStatus(group) === "on_hold"
                    ? "amber"
                    : "slate"
            }
          >
            {groupStatusLabel(group)}
          </Badge>
          {group.is_overdue && group.completed_count < group.assignee_count && (
            <Badge tone="red">Overdue</Badge>
          )}
        </div>
      ),
    },
    {
      header: "Progress",
      cell: (group) =>
        group.assignee_count > 1 ? `${group.completed_count}/${group.assignee_count}` : "-",
    },
  ];

  return (
    <div>
      <PageHeader
        title="Task Assignment"
        subtitle="Create, assign, and track employee tasks across projects"
        action={
          <div className="flex flex-wrap items-center gap-2">
            {can("deleteTasks") && (
              <Button variant="outline" onClick={() => setClearAllOpen(true)} icon={<Trash2 className="h-4 w-4" />}>
                Clear All Tasks
              </Button>
            )}
            {can("assignTasks") && (
              <Button onClick={() => setCreateOpen(true)} icon={<Plus className="h-4 w-4" />}>
                Assign Task
              </Button>
            )}
          </div>
        }
      />

      {error && (
        <div className="mb-4">
          <Alert variant="error">{error}</Alert>
        </div>
      )}

      <div className="mb-6">
        <TaskAnalyticsCards analytics={analytics} />
      </div>

      <Card className="mb-4 p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <EmployeeCombobox
              label="Employee"
              value={filterEmployee}
              onChange={setFilterEmployee}
              hideHint
            />
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
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-600 lg:col-span-2">
              <input type="checkbox" checked={filterOverdue} onChange={(e) => setFilterOverdue(e.target.checked)} />
              Overdue only
            </label>
          </div>
          <div className="flex gap-2">
            <Button variant={view === "list" ? "primary" : "outline"} onClick={() => setView("list")} icon={<List className="h-4 w-4" />}>
              List
            </Button>
            <Button variant={view === "calendar" ? "primary" : "outline"} onClick={() => setView("calendar")} icon={<CalendarDays className="h-4 w-4" />}>
              Calendar
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <CrossfadeSwitch state={loading ? "loading" : view}>
        {loading ? (
          <ContentSkeleton />
        ) : view === "calendar" ? (
          <div className="p-4">
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
        ) : groups.length === 0 ? (
          <EmptyState title="No tasks match your filters" />
        ) : (
          <ResponsiveTable
            columns={columns}
            data={groups}
            rowKey={(group) => group.group_id}
            onRowClick={(group) => setSelectedGroupId(group.group_id)}
            actions={(group) => (
              <div className="flex items-center gap-1">
                {can("editTasks") && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Pencil className="h-4 w-4 text-slate-500" />}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditTarget(group);
                    }}
                    aria-label={`Edit ${group.title}`}
                  />
                )}
                {can("deleteTasks") && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Trash2 className="h-4 w-4 text-red-500" />}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(group);
                    }}
                    aria-label={`Delete ${group.title}`}
                  />
                )}
              </div>
            )}
          />
        )}
        </CrossfadeSwitch>
      </Card>

      <TaskFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={() => {
          setCreateOpen(false);
          load();
        }}
      />

      <TaskFormModal
        open={Boolean(editTarget)}
        group={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={() => {
          setEditTarget(null);
          load();
        }}
      />

      <TaskDetailModal
        groupId={selectedGroupId}
        mode="admin"
        open={Boolean(selectedGroupId)}
        onClose={() => setSelectedGroupId(null)}
        onUpdated={() => load()}
        onDeleted={() => {
          setSelectedGroupId(null);
          load();
        }}
      />

      <MembersModal
        group={membersTarget}
        open={Boolean(membersTarget)}
        onClose={() => setMembersTarget(null)}
      />

      <TaskDeleteConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete Task?"
        message={deleteMessage}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (deleteTarget) await handleDeleteGroup(deleteTarget);
        }}
      />

      <TaskDeleteConfirmModal
        open={clearAllOpen}
        title="Clear All Tasks?"
        message="This will permanently delete every task, assignment, comment, attachment, and related notification for all employees. This cannot be undone."
        confirmLabel="Clear All"
        onCancel={() => setClearAllOpen(false)}
        onConfirm={handleClearAll}
      />
    </div>
  );
}

const TASK_FORM_ID = "task-form";

function MembersModal({
  group,
  open,
  onClose,
}: {
  group: TaskGroupSummary | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!group) return null;

  return (
    <Modal open={open} onClose={onClose} title={`Assigned Employees — ${group.title}`} widthClassName="max-w-md">
      <div className="space-y-2">
        {group.assignees.map((assignee) => (
          <div key={assignee.employee_id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
            <div className="flex items-center gap-3">
              <EmployeeAvatar
                name={assignee.employee_name}
                photoPath={assignee.employee_profile_photo_path}
                size="sm"
              />
              <div>
                <p className="font-medium text-slate-900">{assignee.employee_name}</p>
                <p className="text-xs text-slate-400">{assignee.employee_code}</p>
              </div>
            </div>
            <Badge tone={assignee.status === "completed" ? "green" : assignee.status === "in_progress" ? "blue" : assignee.status === "on_hold" ? "amber" : "slate"}>
              {STATUS_LABELS[assignee.status]}
            </Badge>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function TaskFormModal({
  open,
  group,
  onClose,
  onSaved,
}: {
  open: boolean;
  group?: TaskGroupSummary | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = Boolean(group);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [siteId, setSiteId] = useState("");
  const [startDate, setStartDate] = useState(todayIso());
  const [dueDate, setDueDate] = useState(todayIso());
  const [expectedDurationDays, setExpectedDurationDays] = useState(1);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    employeesApi.listActiveEmployees().then(setEmployees);
    sitesApi.listSites().then(setSites);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (group) {
      setSelectedIds(group.assignees.map((assignee) => assignee.employee_id));
      setTitle(group.title);
      setDescription(group.description ?? "");
      setPriority(group.priority);
      setSiteId(group.site_id ?? "");
      setStartDate(group.start_date ?? todayIso());
      setDueDate(group.due_date ?? todayIso());
      setExpectedDurationDays(group.expected_duration_days);
    } else {
      setSelectedIds([]);
      setTitle("");
      setDescription("");
      setPriority("medium");
      setSiteId("");
      setStartDate(todayIso());
      setDueDate(todayIso());
      setExpectedDurationDays(1);
    }
    setAttachments([]);
    setError(null);
  }, [open, group]);

  function toggleEmployee(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (selectedIds.length === 0) {
      setError("Select at least one employee");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const payload = {
        employeeIds: selectedIds,
        title,
        description: description || null,
        priority,
        siteId: siteId || null,
        startDate,
        dueDate,
        expectedDurationDays,
        attachments,
      };
      if (isEdit && group) {
        await tasksApi.adminUpdateTaskGroup(group.group_id, payload);
      } else {
        await tasksApi.adminAssignTask(payload);
      }
      onSaved();
    } catch (err) {
      setError(extractErrorMessage(err, isEdit ? "Failed to update task" : "Failed to assign task"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit Task" : "Assign Task"}
      widthClassName="max-w-2xl"
      footer={
        <ModalFooterActions>
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form={TASK_FORM_ID} isLoading={submitting}>
            {isEdit ? "Save Changes" : "Assign Task"}
          </Button>
        </ModalFooterActions>
      }
    >
      <form id={TASK_FORM_ID} onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <Alert variant="error">{error}</Alert>}
        <Input label="Task Title" required value={title} onChange={(e) => setTitle(e.target.value)} />
        <Textarea label="Description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Priority" value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </Select>
          <Select label="Project / Site" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            <option value="">No site</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
          <Input label="Start Date" type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <Input label="Due Date" type="date" required value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          <Input
            label="Expected Duration (days)"
            type="number"
            min={1}
            max={365}
            required
            value={expectedDurationDays}
            onChange={(e) => setExpectedDurationDays(parseInt(e.target.value, 10) || 1)}
          />
        </div>
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">Assign To</p>
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-3">
            {employees.map((emp) => (
              <label key={emp.id} className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={selectedIds.includes(emp.id)} onChange={() => toggleEmployee(emp.id)} />
                <EmployeeAvatar name={emp.name} photoPath={emp.profile_photo_path} size="xs" />
                <span>
                  {emp.name} ({emp.employee_code})
                </span>
              </label>
            ))}
          </div>
        </div>
        <Input
          label={isEdit ? "Add Attachments (optional)" : "Attachments"}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,application/pdf"
          onChange={(e) => setAttachments(Array.from(e.target.files ?? []))}
        />
      </form>
    </Modal>
  );
}
