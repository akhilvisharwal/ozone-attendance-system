import { weekEndSunday, weekStartMonday } from "./expenseWeek";

export type ReimbursementPeriodType = "weekly" | "monthly" | "custom";

export interface DateRange {
  start: string;
  end: string;
}

function padDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function weeklyRange(referenceDate?: string): DateRange {
  const start = weekStartMonday(referenceDate ?? new Date().toISOString().slice(0, 10));
  return { start, end: weekEndSunday(start) };
}

export function monthlyRange(referenceDate?: string): DateRange {
  const ref = referenceDate ?? new Date().toISOString().slice(0, 10);
  const [y, m] = ref.split("-").map(Number);
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

export function resolveReimbursementPeriod(
  periodType: ReimbursementPeriodType,
  from?: string,
  to?: string
): DateRange {
  if (periodType === "weekly") {
    return weeklyRange(from);
  }
  if (periodType === "monthly") {
    return monthlyRange(from);
  }
  if (!from || !to) {
    throw new Error("Custom reimbursement period requires from and to dates");
  }
  if (from > to) {
    throw new Error("Period start must be on or before period end");
  }
  return { start: from, end: to };
}

export function formatPeriodLabel(
  periodType: ReimbursementPeriodType,
  start: string,
  end: string
): string {
  if (periodType === "weekly") return `Week ${start} → ${end}`;
  if (periodType === "monthly") return `Month ${start.slice(0, 7)}`;
  return `${start} → ${end}`;
}
