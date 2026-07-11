import { apiClient } from "./client";
import type {
  DependencyCounts,
  Employee,
  EmployeeDesignation,
  PaginatedResponse,
} from "@/types";

export interface CreateEmployeeInput {
  name: string;
  email?: string | null;
  phone?: string | null;
  department?: string | null;
  /** Optional when Settings → Employees has a default role. */
  designationId?: string | null;
}

export interface UpdateEmployeeInput {
  name?: string;
  email?: string | null;
  phone?: string | null;
  department?: string | null;
  designationId?: string | null;
}

export interface NewEmployeeCredentials {
  employee: Employee;
  credentials: { employeeId: string; temporaryPassword: string };
}

export async function createEmployee(input: CreateEmployeeInput) {
  const res = await apiClient.post<NewEmployeeCredentials>("/employees", input);
  return res.data;
}

export async function listEmployees(params: {
  search?: string;
  isActive?: boolean;
  designationId?: string;
  sort?: "oldest" | "newest";
  page?: number;
  limit?: number;
}) {
  const res = await apiClient.get<PaginatedResponse<Employee>>("/employees", { params });
  return res.data;
}

export interface DesignationsResponse {
  items: EmployeeDesignation[];
  total: number;
  defaultDesignationId: string | null;
}

export async function listDesignations(): Promise<EmployeeDesignation[]> {
  const res = await apiClient.get<DesignationsResponse>("/employees/designations");
  return res.data.items;
}

export async function fetchDesignations(): Promise<DesignationsResponse> {
  const res = await apiClient.get<DesignationsResponse>("/employees/designations");
  return res.data;
}

export async function createDesignation(name: string): Promise<EmployeeDesignation> {
  const res = await apiClient.post<{ designation: EmployeeDesignation }>("/employees/designations", {
    name,
  });
  return res.data.designation;
}

export async function updateDesignation(
  id: string,
  name: string
): Promise<EmployeeDesignation> {
  const res = await apiClient.patch<{ designation: EmployeeDesignation }>(
    `/employees/designations/${id}`,
    { name }
  );
  return res.data.designation;
}

export async function deleteDesignation(id: string): Promise<void> {
  await apiClient.delete(`/employees/designations/${id}`);
}

/** All active employees for filter dropdowns (chronological by createdAt, oldest first). */
export async function listActiveEmployees() {
  const res = await apiClient.get<{ items: Employee[]; total: number }>("/employees/active");
  return res.data.items;
}

export async function getEmployeeById(id: string) {
  const res = await apiClient.get<{ employee: Employee }>(`/employees/${id}`);
  return res.data.employee;
}

export async function updateEmployee(id: string, input: UpdateEmployeeInput) {
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
  form.append("avatar", file, "avatar.webp");
  const res = await apiClient.patch<{ employee: Employee }>("/employees/me/avatar", form);
  return res.data.employee;
}

export async function deleteMyAvatar(): Promise<Employee> {
  const res = await apiClient.delete<{ employee: Employee }>("/employees/me/avatar");
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
  form.append("avatar", file, "avatar.webp");
  const res = await apiClient.patch<{ employee: Employee }>(`/employees/${id}/avatar`, form);
  return res.data.employee;
}

/** Admin: remove an employee's profile photo. */
export async function adminDeleteEmployeeAvatar(id: string): Promise<Employee> {
  const res = await apiClient.delete<{ employee: Employee }>(`/employees/${id}/avatar`);
  return res.data.employee;
}

/** Admin: set an employee's individual weekly off days (0=Sun .. 6=Sat). */
export async function updateWeeklyOff(
  id: string,
  weeklyOffDays: number[],
  useCompanyDefault = false
): Promise<Employee> {
  const res = await apiClient.patch<{ employee: Employee }>(`/employees/${id}/weekly-off`, {
    weeklyOffDays,
    useCompanyDefault,
  });
  return res.data.employee;
}

/** Admin: how many related records an employee has (shown before deletion). */
export async function getEmployeeDependencies(id: string): Promise<DependencyCounts> {
  const res = await apiClient.get<{ dependencies: DependencyCounts }>(`/employees/${id}/dependencies`);
  return res.data.dependencies;
}

/** Admin: soft-delete an employee (historical records are preserved). Requires email OTP. */
export async function deleteEmployee(
  id: string,
  otp: { otpChallengeId: string; otpCode: string }
): Promise<{ employee: Employee; dependencies: DependencyCounts }> {
  const res = await apiClient.delete<{ employee: Employee; dependencies: DependencyCounts }>(
    `/employees/${id}`,
    { data: otp }
  );
  return res.data;
}
