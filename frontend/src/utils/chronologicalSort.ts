/** Shared chronological sort for employee lists and attendance records. */
export type ChronologicalSort = "oldest" | "newest";

export function normalizeEmployeeName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/** Case-insensitive duplicate check against known employees (excludeId for edits). */
export function findDuplicateEmployeeName(
  candidate: string,
  employees: Array<{ id: string; name: string; employee_code?: string }>,
  excludeId?: string
): { id: string; name: string; employee_code?: string } | null {
  const normalized = normalizeEmployeeName(candidate).toLowerCase();
  if (!normalized) return null;
  return (
    employees.find(
      (e) =>
        e.id !== excludeId &&
        normalizeEmployeeName(e.name).toLowerCase() === normalized
    ) ?? null
  );
}
