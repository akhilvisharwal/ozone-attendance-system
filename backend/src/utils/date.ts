/** Returns YYYY-MM-DD for the given date in the server's local timezone. */
export function toDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function todayDateString(): string {
  return toDateString(new Date());
}

/** Employee registration/joining date as YYYY-MM-DD in the server local timezone. */
export function employeeJoinDate(createdAt: Date | string): string {
  const date = createdAt instanceof Date ? createdAt : new Date(createdAt);
  return toDateString(date);
}

export function minutesBetween(start: Date, end: Date): number {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

/** Builds a local Date at the given calendar day and HH:mm closing time. */
export function closingTimestampForDate(date: string, hour: number, minute: number): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

export interface TimeOfDay {
  hour: number;
  minute: number;
}

/** True when `now` is at or after the cutoff on the same calendar day; always true for past dates. */
export function isPastTimeCutoff(now: Date, cutoff: TimeOfDay, date: string): boolean {
  const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  if (date !== localDate) return true;
  if (now.getHours() > cutoff.hour) return true;
  if (now.getHours() === cutoff.hour && now.getMinutes() >= cutoff.minute) return true;
  return false;
}

export function formatMinutesAsHours(totalMinutes: number | null): string {
  if (totalMinutes === null || totalMinutes === undefined) return "-";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}
