import { apiClient } from "./client";

export type HolidayType = "one_time" | "recurring";

export interface CompanyHoliday {
  id: string;
  name: string;
  description: string | null;
  holiday_type: HolidayType;
  holiday_date: string | null;
  recurring_month: number | null;
  recurring_day: number | null;
  created_at: string;
  updated_at: string;
}

export interface ResolvedHoliday {
  id: string;
  name: string;
  description: string | null;
  holiday_type: HolidayType;
  holiday_date: string;
}

export interface CreateHolidayInput {
  name: string;
  description?: string | null;
  holidayType: HolidayType;
  holidayDate?: string | null;
  recurringMonth?: number | null;
  recurringDay?: number | null;
}

export async function listHolidays(params?: { year?: number; from?: string; to?: string }) {
  const res = await apiClient.get<{ items: CompanyHoliday[]; resolved?: ResolvedHoliday[] }>("/holidays", {
    params,
  });
  return res.data;
}

export async function getUpcomingHolidays(limit = 5) {
  const res = await apiClient.get<{ items: ResolvedHoliday[] }>("/holidays/upcoming", { params: { limit } });
  return res.data.items;
}

export async function createHoliday(input: CreateHolidayInput) {
  const res = await apiClient.post<{ holiday: CompanyHoliday }>("/holidays", input);
  return res.data.holiday;
}

export async function createHolidayForDate(date: string, input: { name: string; description?: string | null }) {
  const res = await apiClient.post<{ holiday: CompanyHoliday }>(`/holidays/date/${date}`, input);
  return res.data.holiday;
}

export async function updateHoliday(id: string, input: Partial<CreateHolidayInput>) {
  const res = await apiClient.patch<{ holiday: CompanyHoliday }>(`/holidays/${id}`, input);
  return res.data.holiday;
}

export async function deleteHoliday(id: string) {
  await apiClient.delete(`/holidays/${id}`);
}
