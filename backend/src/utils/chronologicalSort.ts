/** Shared chronological sort for employee lists and attendance records. */
export const CHRONOLOGICAL_SORTS = ["oldest", "newest"] as const;
export type ChronologicalSort = (typeof CHRONOLOGICAL_SORTS)[number];

export function employeeCreatedAtOrderBy(
  sort: ChronologicalSort = "oldest",
  alias = "e"
): string {
  return sort === "newest"
    ? `ORDER BY ${alias}.created_at DESC, ${alias}.employee_code ASC`
    : `ORDER BY ${alias}.created_at ASC, ${alias}.employee_code ASC`;
}

export function attendanceDateOrderBy(
  sort: ChronologicalSort = "oldest",
  alias = "a"
): string {
  return sort === "newest"
    ? `ORDER BY ${alias}.attendance_date DESC, ${alias}.check_in_time DESC NULLS LAST`
    : `ORDER BY ${alias}.attendance_date ASC, ${alias}.check_in_time ASC NULLS LAST`;
}

export function normalizeEmployeeName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}
