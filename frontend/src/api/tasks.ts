import { apiClient } from "./client";
import type {
  Task,
  TaskAnalytics,
  TaskComment,
  TaskDetail,
  TaskExtensionRequest,
  TaskGroupDetail,
  TaskGroupSummary,
  TaskPriority,
  TaskStatus,
} from "@/types";

export type TaskSortOrder = "newest" | "oldest";

export interface AssignTaskInput {
  employeeIds: string[];
  title: string;
  description?: string | null;
  priority?: TaskPriority;
  siteId?: string | null;
  startDate: string;
  dueDate: string;
  expectedDurationDays?: number;
  attachments?: File[];
}

export interface CreateSelfTaskInput {
  title: string;
  description?: string | null;
  priority?: TaskPriority;
  startDate?: string;
  dueDate?: string;
  expectedDurationDays?: number;
}

function buildAssignFormData(input: AssignTaskInput): FormData {
  const form = new FormData();
  form.append("employeeIds", JSON.stringify(input.employeeIds));
  form.append("title", input.title);
  if (input.description) form.append("description", input.description);
  form.append("priority", input.priority ?? "medium");
  if (input.siteId) form.append("siteId", input.siteId);
  form.append("startDate", input.startDate);
  form.append("dueDate", input.dueDate);
  form.append("expectedDurationDays", String(input.expectedDurationDays ?? 1));
  for (const file of input.attachments ?? []) {
    form.append("attachments", file);
  }
  return form;
}

export async function listMyTasks(params?: {
  status?: TaskStatus;
  overdue?: boolean;
  sort?: TaskSortOrder;
}) {
  const res = await apiClient.get<{ tasks: Task[] }>("/tasks/me", {
    params: {
      status: params?.status,
      overdue: params?.overdue ? "true" : undefined,
      sort: params?.sort ?? "newest",
    },
  });
  return res.data.tasks;
}

export async function getMyTaskDetail(id: string) {
  const res = await apiClient.get<TaskDetail>(`/tasks/me/${id}`);
  return res.data;
}

export async function getMyTaskAnalytics() {
  const res = await apiClient.get<{ analytics: TaskAnalytics }>("/tasks/me/analytics");
  return res.data.analytics;
}

export async function getMyTaskCalendar(from: string, to: string) {
  const res = await apiClient.get<{ tasks: Task[] }>("/tasks/me/calendar", { params: { from, to } });
  return res.data.tasks;
}

export async function createMyTask(input: CreateSelfTaskInput) {
  const res = await apiClient.post<{ task: Task }>("/tasks/me", input);
  return res.data.task;
}

export async function updateMyTask(id: string, input: { status?: TaskStatus; progressRemarks?: string | null }) {
  const res = await apiClient.patch<{ task: Task }>(`/tasks/me/${id}`, input);
  return res.data.task;
}

export async function requestExtension(id: string, input: { requestedDueDate: string; reason: string }) {
  const res = await apiClient.post<{ request: TaskExtensionRequest }>(`/tasks/me/${id}/extension`, input);
  return res.data.request;
}

export async function addMyTaskComment(id: string, body: string) {
  const res = await apiClient.post<{ comment: TaskComment }>(`/tasks/me/${id}/comments`, { body });
  return res.data.comment;
}

export async function deleteMyTask(id: string) {
  await apiClient.delete(`/tasks/me/${id}`);
}

export async function adminListTaskGroups(params?: {
  employeeId?: string;
  status?: TaskStatus;
  overdue?: boolean;
  groupId?: string;
  sort?: TaskSortOrder;
}) {
  const res = await apiClient.get<{ groups: TaskGroupSummary[] }>("/tasks/groups", {
    params: {
      employeeId: params?.employeeId,
      status: params?.status,
      overdue: params?.overdue ? "true" : undefined,
      groupId: params?.groupId,
      sort: params?.sort ?? "newest",
    },
  });
  return res.data.groups;
}

/** @deprecated Use adminListTaskGroups */
export async function adminListTasks(params?: {
  employeeId?: string;
  status?: TaskStatus;
  overdue?: boolean;
  groupId?: string;
  sort?: TaskSortOrder;
}) {
  return adminListTaskGroups(params);
}

export async function adminGetGroupDetail(groupId: string) {
  const res = await apiClient.get<TaskGroupDetail>(`/tasks/groups/${groupId}`);
  return res.data;
}

export async function adminGetTaskDetail(id: string) {
  const res = await apiClient.get<TaskGroupDetail>(`/tasks/${id}`);
  return res.data;
}

export async function adminUpdateTaskGroup(groupId: string, input: AssignTaskInput) {
  const res = await apiClient.patch<{ group: TaskGroupSummary }>(
    `/tasks/groups/${groupId}`,
    buildAssignFormData(input),
    { headers: { "Content-Type": "multipart/form-data" } }
  );
  return res.data.group;
}

export async function adminDeleteTaskGroup(groupId: string) {
  const res = await apiClient.delete<{ message: string; deletedCount: number }>(
    `/tasks/groups/${groupId}`
  );
  return res.data;
}

export async function adminGetTaskAnalytics() {
  const res = await apiClient.get<{ analytics: TaskAnalytics }>("/tasks/analytics");
  return res.data.analytics;
}

export async function adminGetTaskCalendar(from: string, to: string, employeeId?: string) {
  const res = await apiClient.get<{ groups: TaskGroupSummary[] }>("/tasks/calendar", {
    params: { from, to, employeeId },
  });
  return res.data.groups;
}

export async function adminAssignTask(input: AssignTaskInput) {
  const res = await apiClient.post<{ groupId: string; tasks: Task[] }>("/tasks", buildAssignFormData(input), {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}

export async function adminAddTaskGroupComment(groupId: string, body: string) {
  const res = await apiClient.post<{ comment: TaskComment }>(`/tasks/groups/${groupId}/comments`, { body });
  return res.data.comment;
}

export async function adminAddTaskComment(id: string, body: string) {
  const res = await apiClient.post<{ comment: TaskComment }>(`/tasks/${id}/comments`, { body });
  return res.data.comment;
}

export async function adminDeleteTask(id: string) {
  const res = await apiClient.delete<{ message: string; deletedCount: number }>(`/tasks/${id}`);
  return res.data;
}

export async function adminClearAllTasks() {
  const res = await apiClient.delete<{ message: string; deletedCount: number }>("/tasks/all");
  return res.data;
}

export async function listPendingExtensions() {
  const res = await apiClient.get<{ requests: TaskExtensionRequest[] }>("/tasks/extensions/pending");
  return res.data.requests;
}

export async function reviewExtension(id: string, input: { status: "approved" | "rejected"; adminRemarks?: string }) {
  const res = await apiClient.patch<{ request: TaskExtensionRequest }>(`/tasks/extensions/${id}/review`, input);
  return res.data.request;
}

export function taskAttachmentUrl(attachmentId: string) {
  return `/api/tasks/attachments/${attachmentId}/download`;
}
