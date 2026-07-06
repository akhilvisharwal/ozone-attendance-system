import { apiClient } from "./client";
import type { DependencyCounts, Employee, PaginatedResponse } from "@/types";

export interface CreateEmployeeInput {
  name: string;
  email?: string | null;
  phone?: string | null;
  department?: string | null;
}

export interface NewEmployeeCredentials {
  employee: Employee;
  credentials: { employeeId: string; temporaryPassword: string };
}

export async function createEmployee(input: CreateEmployeeInput) {
  const res = await apiClient.post<NewEmployeeCredentials>("/employees", input);
  return res.data;
}

export async function listEmployees(params: { search?: string; isActive?: boolean; page?: number; limit?: number }) {
  const res = await apiClient.get<PaginatedResponse<Employee>>("/employees", { params });
  return res.data;
}

export async function getEmployeeById(id: string) {
  const res = await apiClient.get<{ employee: Employee }>(`/employees/${id}`);
  return res.data.employee;
}

export async function updateEmployee(id: string, input: Partial<CreateEmployeeInput>) {
  const res = await apiClient.patch<{ employee: Employee }>(`/employees/${id}`, input);
  return res.data.employee;
}

export async function setEmployeeActive(id: string, isActive: boolean) {
  const res = await apiClient.patch<{ employee: Employee }>(`/employees/${id}/status`, { isActive });
  return res.data.employee;
}

export async function resetEmployeePassword(id: string) {
  const res = await apiClient.post<{ credentials: { employeeId: string; temporaryPassword: string } }>(
    `/employees/${id}/reset-password`
  );
  return res.data.credentials;
}

export async function updateMyAvatar(file: Blob) {
  const form = new FormData();
  form.append("avatar", file, "avatar.jpg");
  const res = await apiClient.patch<{ employee: Employee }>("/employees/me/avatar", form);
  return res.data.employee;
}

export async function changeEmployeePassword(
  id: string,
  payload: { newPassword: string; requireChange?: boolean }
): Promise<{ credentials: { employeeId: string; temporaryPassword: string } }> {
  const res = await apiClient.post<{ credentials: { employeeId: string; temporaryPassword: string } }>(
    `/employees/${id}/reset-password`,
    payload
  );
  return res.data;
}

/** Admin: replace an employee's profile photo. */
export async function adminSetEmployeeAvatar(id: string, file: Blob): Promise<Employee> {
  const form = new FormData();
  form.append("avatar", file, "avatar.jpg");
  const res = await apiClient.patch<{ employee: Employee }>(`/employees/${id}/avatar`, form);
  return res.data.employee;
}

/** Admin: remove an employee's profile photo. */
export async function adminDeleteEmployeeAvatar(id: string): Promise<Employee> {
  const res = await apiClient.delete<{ employee: Employee }>(`/employees/${id}/avatar`);
  return res.data.employee;
}

/** Admin: set an employee's individual weekly off days (0=Sun .. 6=Sat). */
export async function updateWeeklyOff(id: string, weeklyOffDays: number[]): Promise<Employee> {
  const res = await apiClient.patch<{ employee: Employee }>(`/employees/${id}/weekly-off`, { weeklyOffDays });
  return res.data.employee;
}

/** Admin: how many related records an employee has (shown before deletion). */
export async function getEmployeeDependencies(id: string): Promise<DependencyCounts> {
  const res = await apiClient.get<{ dependencies: DependencyCounts }>(`/employees/${id}/dependencies`);
  return res.data.dependencies;
}

/** Admin: soft-delete an employee (historical records are preserved). */
export async function deleteEmployee(id: string): Promise<{ employee: Employee; dependencies: DependencyCounts }> {
  const res = await apiClient.delete<{ employee: Employee; dependencies: DependencyCounts }>(`/employees/${id}`);
  return res.data;
}
