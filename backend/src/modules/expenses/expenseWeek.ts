/** Week helpers for expense grouping (Monday–Sunday). */

/** Returns YYYY-MM-DD for the Monday of the week containing `dateStr` (YYYY-MM-DD). */
export function weekStartMonday(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const day = date.getDay(); // 0=Sun … 6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const dayNum = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${dayNum}`;
}

/** Sunday (inclusive) of the week that starts on `weekStart` (Monday YYYY-MM-DD). */
export function weekEndSunday(weekStart: string): string {
  const [y, m, d] = weekStart.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + 6);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const dayNum = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${dayNum}`;
}

export function formatWeekLabel(weekStart: string): string {
  return `${weekStart} → ${weekEndSunday(weekStart)}`;
}
