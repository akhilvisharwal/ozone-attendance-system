import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { CheckCircle2, Circle, Clock, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Spinner, EmptyState } from "@/components/ui/Spinner";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Alert } from "@/components/ui/Alert";
import { FilterBar } from "@/components/ui/ResponsiveTable";
import * as tasksApi from "@/api/tasks";
import type { Task, TaskPriority, TaskStatus } from "@/types";
import { extractErrorMessage } from "@/api/client";
import { formatDate } from "@/utils/format";
import { todayIso } from "@/utils/format";

const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_TONES: Record<TaskStatus, "slate" | "blue" | "green" | "red"> = {
  pending: "slate",
  in_progress: "blue",
  completed: "green",
  cancelled: "red",
};

const PRIORITY_TONES: Record<TaskPriority, "slate" | "amber" | "red"> = {
  low: "slate",
  medium: "amber",
  high: "red",
};

export function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<TaskStatus | "">("");
  const [filterDate, setFilterDate] = useState(todayIso());
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    tasksApi
      .listMyTasks({
        date: filterDate || undefined,
        status: filterStatus as TaskStatus || undefined,
      })
      .then(setTasks)
      .catch(() => setError("Failed to load tasks"))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleStatusChange(task: Task, status: TaskStatus) {
    try {
      const updated = await tasksApi.updateMyTaskStatus(task.id, status);
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    } catch {
      setError("Failed to update task status");
    }
  }

  async function handleDelete(task: Task) {
    if (!confirm(`Delete task "${task.title}"?`)) return;
    try {
      await tasksApi.deleteMyTask(task.id);
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
    } catch {
      setError("Can only delete tasks you assigned to yourself (not admin-assigned tasks)");
    }
  }

  return (
    <div>
      <PageHeader
        title="My Tasks"
        subtitle="Self-assign tasks or view tasks assigned by your administrator"
        action={
          <Button onClick={() => setCreateOpen(true)} icon={<Plus className="h-4 w-4" />}>
            Add Task
          </Button>
        }
      />

      {error && <Alert variant="error">{error}</Alert>}

      <Card className="mb-4">
        <FilterBar>
          <Input label="Date" type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} />
          <Select label="Status" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as TaskStatus | "")}>
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </Select>
          <Button variant="outline" onClick={load} className="sm:self-end">Filter</Button>
        </FilterBar>
      </Card>

      <Card>
        {loading ? (
          <Spinner />
        ) : tasks.length === 0 ? (
          <EmptyState title="No tasks for this date/filter" description="Click 'Add Task' to create one for yourself" />
        ) : (
          <div className="divide-y divide-slate-100">
            {tasks.map((task) => (
              <div key={task.id} className="flex items-start gap-3 px-4 py-4 sm:px-5">
                <button
                  onClick={() =>
                    handleStatusChange(
                      task,
                      task.status === "completed" ? "pending" : "completed"
                    )
                  }
                  className="mt-0.5 flex-shrink-0 text-slate-300 hover:text-emerald-500"
                >
                  {task.status === "completed" ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  ) : (
                    <Circle className="h-5 w-5" />
                  )}
                </button>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className={`text-sm font-medium ${task.status === "completed" ? "line-through text-slate-400" : "text-slate-900"}`}>
                      {task.title}
                    </p>
                    <Badge tone={PRIORITY_TONES[task.priority]}>{task.priority}</Badge>
                    <Badge tone={STATUS_TONES[task.status]}>{STATUS_LABELS[task.status]}</Badge>
                    {task.assigned_by_name && task.assigned_by !== task.employee_id && (
                      <span className="text-xs text-slate-400">Assigned by {task.assigned_by_name}</span>
                    )}
                  </div>
                  {task.description && <p className="mt-1 text-sm text-slate-500">{task.description}</p>}
                  <div className="mt-1 flex items-center gap-3 text-xs text-slate-400">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {task.attendance_date ? formatDate(task.attendance_date) : "No date"}
                    </span>
                  </div>

                  {/* Controls: below content, wrap on small screens */}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {task.status !== "completed" && task.status !== "cancelled" && (
                      <Select
                        value={task.status}
                        onChange={(e) => handleStatusChange(task, e.target.value as TaskStatus)}
                        className="w-auto text-xs"
                      >
                        <option value="pending">Pending</option>
                        <option value="in_progress">In Progress</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                      </Select>
                    )}
                    {(!task.assigned_by || task.assigned_by === task.employee_id) && (
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(task)}>
                        <Trash2 className="h-4 w-4 text-red-400" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <CreateTaskModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(task) => {
          setTasks((prev) => [task, ...prev]);
          setCreateOpen(false);
        }}
      />
    </div>
  );
}

function CreateTaskModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (task: Task) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [date, setDate] = useState(todayIso());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const task = await tasksApi.createMyTask({
        title,
        description: description || null,
        priority,
        attendanceDate: date || null,
      });
      setTitle("");
      setDescription("");
      setPriority("medium");
      onCreated(task);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to create task"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add New Task">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <Alert variant="error">{error}</Alert>}
        <Input label="Task Title" required value={title} onChange={(e) => setTitle(e.target.value)} />
        <Textarea
          label="Description"
          hint="Optional"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <Select label="Priority" value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </Select>
        <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <Button type="submit" isLoading={submitting} className="mt-2">
          Create Task
        </Button>
      </form>
    </Modal>
  );
}
