import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Download, Paperclip, Trash2, Users, CalendarClock } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select, Textarea } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { Spinner } from "@/components/ui/Spinner";
import { TaskDeleteConfirmModal } from "@/components/tasks/TaskDeleteConfirmModal";
import { TaskExtensionRequestModal } from "@/components/tasks/TaskExtensionRequestModal";
import * as tasksApi from "@/api/tasks";
import { apiClient, extractErrorMessage } from "@/api/client";
import type {
  Task,
  TaskDetail,
  TaskExtensionRequest,
  TaskGroupDetail,
  TaskStatus,
} from "@/types";
import { formatDate, formatDateTime } from "@/utils/format";

const STATUS_LABELS: Record<TaskStatus, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  on_hold: "On Hold",
  completed: "Completed",
};

const EXTENSION_STATUS_LABELS: Record<TaskExtensionRequest["status"], string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

const EXTENSION_STATUS_TONES: Record<TaskExtensionRequest["status"], "amber" | "green" | "red"> = {
  pending: "amber",
  approved: "green",
  rejected: "red",
};

interface TaskDetailModalProps {
  taskId?: string | null;
  groupId?: string | null;
  mode: "admin" | "employee";
  open: boolean;
  onClose: () => void;
  onUpdated?: (task: Task) => void;
  onDeleted?: () => void;
}

export function TaskDetailModal({
  taskId,
  groupId,
  mode,
  open,
  onClose,
  onUpdated,
  onDeleted,
}: TaskDetailModalProps) {
  const [employeeDetail, setEmployeeDetail] = useState<TaskDetail | null>(null);
  const [adminDetail, setAdminDetail] = useState<TaskGroupDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<TaskStatus>("not_started");
  const [progressRemarks, setProgressRemarks] = useState("");
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [extensionOpen, setExtensionOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const resolvedGroupId = mode === "admin" ? groupId : null;
  const resolvedTaskId = mode === "employee" ? taskId : null;

  useEffect(() => {
    if (!open) {
      setEmployeeDetail(null);
      setAdminDetail(null);
      setExtensionOpen(false);
      return;
    }
    if (mode === "admin" && !groupId) {
      setAdminDetail(null);
      return;
    }
    if (mode === "employee" && !taskId) {
      setEmployeeDetail(null);
      return;
    }

    setLoading(true);
    setError(null);
    const loader =
      mode === "admin" && groupId
        ? () => tasksApi.adminGetGroupDetail(groupId)
        : () => tasksApi.getMyTaskDetail(taskId!);

    loader()
      .then((data) => {
        if (mode === "admin") {
          const groupDetail = data as TaskGroupDetail;
          setAdminDetail(groupDetail);
          setEmployeeDetail(null);
        } else {
          const taskDetail = data as TaskDetail;
          setEmployeeDetail(taskDetail);
          setAdminDetail(null);
          setStatus(taskDetail.task.status);
          setProgressRemarks(taskDetail.task.progress_remarks ?? "");
        }
      })
      .catch(() => setError("Failed to load task details"))
      .finally(() => setLoading(false));
  }, [open, taskId, groupId, mode]);

  async function handleUpdateStatus(e: FormEvent) {
    e.preventDefault();
    if (!resolvedTaskId || mode !== "employee") return;
    setUpdatingStatus(true);
    setError(null);
    try {
      const task = await tasksApi.updateMyTask(resolvedTaskId, { status, progressRemarks: progressRemarks || null });
      setEmployeeDetail((prev) => {
        if (!prev) return prev;
        const teamMembers = prev.teamMembers?.map((member) =>
          member.is_current_user ? { ...member, status: task.status } : member
        );
        return { ...prev, task, teamMembers };
      });
      onUpdated?.(task);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to update task status"));
    } finally {
      setUpdatingStatus(false);
    }
  }

  function handleExtensionSubmitted(request: TaskExtensionRequest) {
    setEmployeeDetail((prev) =>
      prev ? { ...prev, extensions: [request, ...(prev.extensions ?? [])] } : prev
    );
  }

  async function handleReviewExtension(request: TaskExtensionRequest, approved: boolean) {
    setUpdatingStatus(true);
    try {
      await tasksApi.reviewExtension(request.id, { status: approved ? "approved" : "rejected" });
      if (resolvedGroupId) {
        const data = await tasksApi.adminGetGroupDetail(resolvedGroupId);
        setAdminDetail(data);
      }
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to review extension"));
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function downloadAttachment(attachmentId: string, fileName: string) {
    const res = await apiClient.get(tasksApi.taskAttachmentUrl(attachmentId), { responseType: "blob" });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleDelete() {
    if (!resolvedGroupId) return;
    setUpdatingStatus(true);
    try {
      await tasksApi.adminDeleteTaskGroup(resolvedGroupId);
      setDeleteOpen(false);
      onClose();
      onDeleted?.();
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to delete task"));
    } finally {
      setUpdatingStatus(false);
    }
  }

  const group = adminDetail?.group;
  const task = employeeDetail?.task;
  const employeeExtensions = employeeDetail?.extensions ?? [];
  const currentDueDate =
    task?.effective_due_date ?? task?.due_date ?? task?.start_date ?? "";
  const attachments = mode === "admin" ? adminDetail?.attachments ?? [] : employeeDetail?.attachments ?? [];
  const extensions = mode === "admin" ? adminDetail?.extensions ?? [] : employeeDetail?.extensions ?? [];
  const assignees = mode === "admin" ? adminDetail?.assignees ?? [] : [];
  const teamMembers = mode === "employee" ? employeeDetail?.teamMembers ?? [] : [];
  const isGroupTask = mode === "employee" && Boolean(employeeDetail?.isGroupTask);
  const assigneeCount = employeeDetail?.assigneeCount ?? teamMembers.length;

  const modalTitle = mode === "admin" ? group?.title ?? "Task Details" : task?.title ?? "Task Details";

  const deleteMessage = group
    ? group.assignee_count > 1
      ? `Delete "${group.title}" for all ${group.assignee_count} assigned employees? This cannot be undone.`
      : `Delete "${group.title}" for ${group.assignees[0]?.employee_name ?? "this employee"}? This cannot be undone.`
    : "";

  const hasContent = mode === "admin" ? Boolean(group) : Boolean(task);
  const showDeleteFooter = mode === "admin" && Boolean(group) && !loading && hasContent;

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={modalTitle}
        widthClassName="max-w-2xl"
        layout="centered"
        footer={
          showDeleteFooter ? (
            <Button
              variant="danger"
              icon={<Trash2 className="h-4 w-4" />}
              onClick={() => setDeleteOpen(true)}
            >
              Delete Task
            </Button>
          ) : undefined
        }
      >
        {loading ? (
          <Spinner />
        ) : !hasContent ? (
          <p className="text-sm text-slate-500">Task not found.</p>
        ) : (
          <div className="flex flex-col gap-6">
            {error && <Alert variant="error">{error}</Alert>}

            <div className="flex flex-wrap items-center gap-2">
              <Badge
                tone={
                  (mode === "admin" ? group!.priority : task!.priority) === "high"
                    ? "red"
                    : (mode === "admin" ? group!.priority : task!.priority) === "medium"
                      ? "amber"
                      : "slate"
                }
              >
                {mode === "admin" ? group!.priority : task!.priority}
              </Badge>
              {mode === "employee" && (
                <>
                  <Badge
                    tone={
                      task!.status === "completed"
                        ? "green"
                        : task!.status === "in_progress"
                          ? "blue"
                          : task!.status === "on_hold"
                            ? "amber"
                            : "slate"
                    }
                  >
                    {STATUS_LABELS[task!.status]}
                  </Badge>
                  {isGroupTask && (
                    <Badge tone="blue">
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        Group Task
                      </span>
                    </Badge>
                  )}
                  {task!.is_overdue && task!.status !== "completed" && <Badge tone="red">Overdue</Badge>}
                </>
              )}
              {mode === "admin" && group!.is_overdue && group!.completed_count < group!.assignee_count && (
                <Badge tone="red">Overdue</Badge>
              )}
            </div>

            {(mode === "admin" ? group!.description : task!.description) && (
              <p className="text-sm text-slate-600">{mode === "admin" ? group!.description : task!.description}</p>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              {mode === "employee" && !isGroupTask && (
                <Info label="Employee" value={task!.employee_name ?? "-"} />
              )}
              <Info label="Project / Site" value={(mode === "admin" ? group!.site_name : task!.site_name) ?? "-"} />
              <Info
                label="Start Date"
                value={
                  (mode === "admin" ? group!.start_date : task!.start_date)
                    ? formatDate((mode === "admin" ? group!.start_date : task!.start_date)!)
                    : "-"
                }
              />
              <Info
                label="Due Date"
                value={formatDate(
                  (mode === "admin"
                    ? group!.effective_due_date ?? group!.due_date
                    : task!.effective_due_date ?? task!.due_date) ?? ""
                )}
              />
              <Info
                label="Duration"
                value={`${mode === "admin" ? group!.expected_duration_days : task!.expected_duration_days} day(s)`}
              />
              {mode === "admin" && (
                <Info label="Assigned By" value={group!.assigned_by_name ?? "-"} />
              )}
              {mode === "employee" && (
                <Info label="Assigned By" value={task!.assigned_by_name ?? "-"} />
              )}
            </div>

            {mode === "employee" && isGroupTask && teamMembers.length > 0 && (
              <section className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Users className="h-4 w-4 text-brand-600" />
                  Assigned Team ({assigneeCount} {assigneeCount === 1 ? "Member" : "Members"})
                </p>
                <div className="space-y-2">
                  {teamMembers.map((member) => (
                    <div
                      key={member.employee_id}
                      className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm ${
                        member.is_current_user
                          ? "border-brand-200 bg-white shadow-sm"
                          : "border-slate-200 bg-white/80"
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900">
                          {member.employee_name}
                          {member.is_current_user && (
                            <span className="ml-2 text-xs font-semibold text-brand-600">(You)</span>
                          )}
                        </p>
                        <p className="text-xs text-slate-400">{member.employee_code}</p>
                      </div>
                      <Badge
                        tone={
                          member.status === "completed"
                            ? "green"
                            : member.status === "in_progress"
                              ? "blue"
                              : member.status === "on_hold"
                                ? "amber"
                                : "slate"
                        }
                      >
                        {member.is_current_user ? `Your status: ${STATUS_LABELS[member.status]}` : STATUS_LABELS[member.status]}
                      </Badge>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  You can view your teammates&apos; progress status only. Update your own status and remarks below.
                </p>
              </section>
            )}

            {mode === "employee" && (
              <form onSubmit={handleUpdateStatus} className="rounded-lg border border-slate-200 p-4">
                <p className="mb-3 text-sm font-semibold text-slate-900">Update Task Status</p>
                <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </Select>
                <Textarea
                  label="Progress Remarks (optional)"
                  className="mt-3"
                  rows={3}
                  value={progressRemarks}
                  onChange={(e) => setProgressRemarks(e.target.value)}
                  placeholder="Add notes about your progress..."
                />
                <Button type="submit" className="mt-3" isLoading={updatingStatus}>
                  Update Status
                </Button>
              </form>
            )}

            {mode === "employee" && (
              <section className="rounded-lg border border-slate-200 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <CalendarClock className="h-4 w-4 text-brand-600" />
                      Extension Requests
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Current due date: <span className="font-medium text-slate-700">{formatDate(currentDueDate)}</span>
                      {" "}— unchanged until admin approval.
                    </p>
                  </div>
                  {task!.status !== "completed" && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      icon={<CalendarClock className="h-4 w-4" />}
                      onClick={() => setExtensionOpen(true)}
                    >
                      Request Extension
                    </Button>
                  )}
                </div>

                {employeeExtensions.length > 0 ? (
                  <div className="mt-4 space-y-2">
                    {employeeExtensions.map((req) => (
                      <div key={req.id} className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium text-slate-900">
                            Requested: {formatDate(req.requested_due_date)}
                          </p>
                          <Badge tone={EXTENSION_STATUS_TONES[req.status]}>
                            {EXTENSION_STATUS_LABELS[req.status]}
                          </Badge>
                        </div>
                        <p className="mt-1 text-slate-600">{req.reason}</p>
                        <p className="mt-1 text-xs text-slate-400">
                          Submitted {formatDateTime(req.created_at)}
                          {req.status === "approved" && req.reviewed_at && (
                            <> · Approved {formatDateTime(req.reviewed_at)}</>
                          )}
                          {req.status === "rejected" && req.reviewed_at && (
                            <> · Rejected {formatDateTime(req.reviewed_at)}</>
                          )}
                        </p>
                        {req.admin_remarks && req.status !== "pending" && (
                          <p className="mt-2 text-xs text-slate-500">
                            Admin note: {req.admin_remarks}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-slate-400">No extension requests yet.</p>
                )}
              </section>
            )}

            {attachments.length > 0 && (
              <section>
                <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Paperclip className="h-4 w-4" /> Attachments
                </p>
                <div className="space-y-2">
                  {attachments.map((file) => (
                    <button
                      key={file.id}
                      type="button"
                      onClick={() => downloadAttachment(file.id, file.file_name)}
                      className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50"
                    >
                      <span className="truncate">{file.file_name}</span>
                      <Download className="h-4 w-4 flex-shrink-0 text-slate-400" />
                    </button>
                  ))}
                </div>
              </section>
            )}

            {mode === "admin" && extensions.length > 0 && (
              <section>
                <p className="mb-2 text-sm font-semibold text-slate-900">Extension Requests</p>
                <div className="space-y-2">
                  {extensions.map((req) => (
                    <div key={req.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                      <p className="font-medium">
                        {req.employee_name ?? "Employee"} — {formatDate(req.requested_due_date)} — {req.status}
                      </p>
                      <p className="text-slate-600">{req.reason}</p>
                      {req.status === "pending" && (
                        <div className="mt-2 flex gap-2">
                          <Button size="sm" onClick={() => handleReviewExtension(req, true)} isLoading={updatingStatus}>Approve</Button>
                          <Button size="sm" variant="outline" onClick={() => handleReviewExtension(req, false)} isLoading={updatingStatus}>Reject</Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {mode === "admin" && assignees.length > 0 && (
              <section>
                <p className="mb-2 text-sm font-semibold text-slate-900">
                  {assignees.length > 1 ? "Assignee Progress" : "Assignee"}
                </p>
                <div className="space-y-2">
                  {assignees.map((assignee) => (
                    <div key={assignee.employee_id} className="rounded-lg border border-slate-200 p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="font-medium text-slate-900">{assignee.employee_name}</p>
                          <p className="text-xs text-slate-400">{assignee.employee_code}</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Badge tone={assignee.status === "completed" ? "green" : assignee.status === "in_progress" ? "blue" : assignee.status === "on_hold" ? "amber" : "slate"}>
                            {STATUS_LABELS[assignee.status]}
                          </Badge>
                          {assignee.is_overdue && assignee.status !== "completed" && (
                            <Badge tone="red">Overdue</Badge>
                          )}
                        </div>
                      </div>
                      {assignee.progress_remarks && (
                        <p className="mt-2 text-slate-600">{assignee.progress_remarks}</p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

          </div>
        )}
      </Modal>

      <TaskExtensionRequestModal
        open={extensionOpen}
        taskId={resolvedTaskId ?? null}
        currentDueDate={currentDueDate}
        onClose={() => setExtensionOpen(false)}
        onSubmitted={handleExtensionSubmitted}
      />

      <TaskDeleteConfirmModal
        open={deleteOpen}
        title="Delete Task?"
        message={deleteMessage}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
      />
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}
