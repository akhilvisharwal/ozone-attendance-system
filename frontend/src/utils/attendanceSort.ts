import type { AdminAttendanceRow } from "@/types";

/** Latest activity: check-out time if present, otherwise check-in time. */
export function getLatestAttendanceActivityTime(
  row: Pick<AdminAttendanceRow, "check_in_time" | "check_out_time">
): string | null {
  return row.check_out_time ?? row.check_in_time ?? null;
}

/** Newest attendance activity first; ties broken by employee name. */
export function sortTodayAttendanceByRecentActivity<T extends AdminAttendanceRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const aTime = getLatestAttendanceActivityTime(a);
    const bTime = getLatestAttendanceActivityTime(b);

    if (!aTime && !bTime) {
      return a.employee_name.localeCompare(b.employee_name);
    }
    if (!aTime) return 1;
    if (!bTime) return -1;

    const diff = new Date(bTime).getTime() - new Date(aTime).getTime();
    if (diff !== 0) return diff;

    return a.employee_name.localeCompare(b.employee_name);
  });
}
