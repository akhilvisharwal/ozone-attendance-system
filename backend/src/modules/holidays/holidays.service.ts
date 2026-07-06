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

/** A holiday resolved to a concrete calendar date within a range. */
export interface ResolvedHoliday {
  id: string;
  name: string;
  description: string | null;
  holiday_type: HolidayType;
  holiday_date: string;
}

/** Expands a stored holiday into concrete YYYY-MM-DD strings within [from, to]. */
export function expandHolidayDates(
  holiday: Pick<CompanyHoliday, "holiday_type" | "holiday_date" | "recurring_month" | "recurring_day">,
  from: string,
  to: string
): string[] {
  if (holiday.holiday_type === "one_time") {
    const d = holiday.holiday_date;
    if (d && d >= from && d <= to) return [d];
    return [];
  }

  const month = holiday.recurring_month;
  const day = holiday.recurring_day;
  if (!month || !day) return [];

  const fromYear = parseInt(from.slice(0, 4), 10);
  const toYear = parseInt(to.slice(0, 4), 10);
  const dates: string[] = [];

  for (let year = fromYear; year <= toYear; year++) {
    const lastDay = new Date(year, month, 0).getDate();
    if (day > lastDay) continue;
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (dateStr >= from && dateStr <= to) dates.push(dateStr);
  }

  return dates;
}

/** Builds a date → holiday lookup for a range (later entries do not overwrite earlier). */
export function resolveHolidaysInRange(
  holidays: CompanyHoliday[],
  from: string,
  to: string
): Map<string, ResolvedHoliday> {
  const map = new Map<string, ResolvedHoliday>();
  for (const h of holidays) {
    for (const date of expandHolidayDates(h, from, to)) {
      map.set(date, {
        id: h.id,
        name: h.name,
        description: h.description,
        holiday_type: h.holiday_type,
        holiday_date: date,
      });
    }
  }
  return map;
}

/** Lists upcoming resolved holidays from today onward. */
export function resolveUpcoming(
  holidays: CompanyHoliday[],
  fromDate: string,
  limit: number
): ResolvedHoliday[] {
  const fromYear = parseInt(fromDate.slice(0, 4), 10);
  const toYear = fromYear + 2;
  const to = `${toYear}-12-31`;
  const resolved = Array.from(resolveHolidaysInRange(holidays, fromDate, to).values());
  return resolved
    .filter((h) => h.holiday_date >= fromDate)
    .sort((a, b) => a.holiday_date.localeCompare(b.holiday_date))
    .slice(0, limit);
}

/** Human-readable schedule label for admin lists. */
export function formatHolidaySchedule(h: CompanyHoliday): string {
  if (h.holiday_type === "recurring" && h.recurring_month && h.recurring_day) {
    const monthNames = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    return `${h.recurring_day} ${monthNames[h.recurring_month - 1]} (every year)`;
  }
  return h.holiday_date ?? "-";
}
