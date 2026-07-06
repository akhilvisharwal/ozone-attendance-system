import { apiClient } from "./client";
import type { Task, TaskStatus, TaskPriority } from "@/types";

export interface CreateTaskInput {
  title: string;
  description?: string | null;
  priority?: TaskPriority;
  attendanceDate?: string | null;
  employeeId?: string; // admin only
}

export async function createMyTask(input: CreateTaskInput) {
  const res = await apiClient.post<{ task: Task }>("/tasks/me", input);
  return res.data.task;
}

export async function listMyTasks(params: { date?: string; status?: TaskStatus }) {
  const res = await apiClient.get<{ tasks: Task[] }>("/tasks/me", { params });
  return res.data.tasks;
}

export async function updateMyTaskStatus(id: string, status: TaskStatus) {
  const res = await apiClient.patch<{ task: Task }>(`/tasks/me/${id}/status`, { status });
  return res.data.task;
}

export async function deleteMyTask(id: string) {
  await apiClient.delete(`/tasks/me/${id}`);
}

export async function adminListTasks(params: { employeeId?: string; date?: string; status?: TaskStatus }) {
  const res = await apiClient.get<{ tasks: Task[] }>("/tasks", { params });
  return res.data.tasks;
}

export async function adminCreateTask(input: CreateTaskInput) {
  const res = await apiClient.post<{ task: Task }>("/tasks", input);
  return res.data.task;
}

export async function adminUpdateTask(id: string, input: Partial<CreateTaskInput & { status: TaskStatus }>) {
  const res = await apiClient.patch<{ task: Task }>(`/tasks/${id}`, input);
  return res.data.task;
}
