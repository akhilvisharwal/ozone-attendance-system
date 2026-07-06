import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { CheckCircle2, Circle, Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Spinner, EmptyState } from "@/components/ui/Spinner";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Alert } from "@/components/ui/Alert";
import { ResponsiveTable, FilterBar, type Column } from "@/components/ui/ResponsiveTable";
import * as tasksApi from "@/api/tasks";
import * as employeesApi from "@/api/employees";
import type { Employee, Task, TaskPriority, TaskStatus } from "@/types";
import { extractErrorMessage } from "@/api/client";
import { formatDate } from "@/utils/format";
import { todayIso } from "@/utils/format";

const STATUS_TONES: Record<TaskStatus, "slate" | "blue" | "green" | "red"> = {
  pending: "slate",
  in_progress: "blue",
  completed: "green",
  cancelled: "red",
};

export function TaskManagementPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterEmployee, setFilterEmployee] = useState("");
  const [filterDate, setFilterDate] = useState(todayIso());
  const [filterStatus, setFilterStatus] = useState<TaskStatus | "">("");
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    employeesApi.listEmployees({ limit: 200 }).then((res) => setEmployees(res.items));
  }, []);

  function load() {
    setLoading(true);
    setError(null);
    tasksApi
      .adminListTasks({
        employeeId: filterEmployee || undefined,
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
      const updated = await tasksApi.adminUpdateTask(task.id, { status });
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    } catch {
      setError("Failed to update task");
    }
  }

  const columns: Column<Task>[] = [
    {
      header: "Employee",
      primary: true,
      cell: (task) => (
        <div>
          <p className="font-medium text-slate-900">{task.employee_name}</p>
          <p className="text-xs text-slate-400">{task.employee_code}</p>
        </div>
      ),
    },
    {
      header: "Task",
      cell: (task) => (
        <div>
          <p className="font-medium text-slate-900">{task.title}</p>
          {task.description && <p className="line-clamp-1 text-xs text-slate-400">{task.description}</p>}
        </div>
      ),
    },
    { header: "Date", cell: (task) => (task.attendance_date ? formatDate(task.attendance_date) : "-") },
    {
      header: "Priority",
      cell: (task) => (
        <Badge tone={task.priority === "high" ? "red" : task.priority === "medium" ? "amber" : "slate"}>
          {task.priority}
        </Badge>
      ),
    },
    { header: "Assigned By", cell: (task) => task.assigned_by_name ?? "-" },
    {
      header: "Current Status",
      cell: (task) => <Badge tone={STATUS_TONES[task.status]}>{task.status.replace("_", " ")}</Badge>,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Task Management"
        subtitle="Assign tasks to employees or view all task activity"
        action={
          <Button onClick={() => setCreateOpen(true)} icon={<Plus className="h-4 w-4" />}>
            Assign Task
          </Button>
        }
      />

      {error && <div className="mb-4"><Alert variant="error">{error}</Alert></div>}

      <Card className="mb-4">
        <FilterBar>
          <Select label="Employee" value={filterEmployee} onChange={(e) => setFilterEmployee(e.target.value)}>
            <option value="">All employees</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.name} ({e.employee_code})</option>
            ))}
          </Select>
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
          <EmptyState title="No tasks match your filters" />
        ) : (
          <ResponsiveTable
            columns={columns}
            data={tasks}
            rowKey={(t) => t.id}
            actions={(task) => (
              <div className="flex items-center gap-2">
                {task.status === "completed" ? (
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-500" />
                ) : (
                  <Circle className="h-4 w-4 flex-shrink-0 text-slate-300" />
                )}
                <Select
                  value={task.status}
                  onChange={(e) => handleStatusChange(task, e.target.value as TaskStatus)}
                  className="text-xs"
                >
                  {(["pending", "in_progress", "completed", "cancelled"] as TaskStatus[]).map((s) => (
                    <option key={s} value={s}>{s.replace("_", " ")}</option>
                  ))}
                </Select>
              </div>
            )}
          />
        )}
      </Card>

      <AssignTaskModal
        employees={employees}
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

function AssignTaskModal({
  employees,
  open,
  onClose,
  onCreated,
}: {
  employees: Employee[];
  open: boolean;
  onClose: () => void;
  onCreated: (task: Task) => void;
}) {
  const [employeeId, setEmployeeId] = useState("");
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
      const task = await tasksApi.adminCreateTask({ employeeId, title, description: description || null, priority, attendanceDate: date });
      setTitle("");
      setDescription("");
      setEmployeeId("");
      onCreated(task);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to assign task"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Assign Task to Employee">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <Alert variant="error">{error}</Alert>}
        <Select label="Employee" required value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
          <option value="">Select an employee</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>{e.name} ({e.employee_code})</option>
          ))}
        </Select>
        <Input label="Task Title" required value={title} onChange={(e) => setTitle(e.target.value)} />
        <Textarea label="Description" hint="Optional" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        <Select label="Priority" value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </Select>
        <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <Button type="submit" isLoading={submitting} className="mt-2">Assign Task</Button>
      </form>
    </Modal>
  );
}
