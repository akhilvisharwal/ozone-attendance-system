export type ManualAttendanceStatus =
  | "present"
  | "half_day"
  | "absent"
  | "leave"
  | "holiday"
  | "weekly_off"
  | "holiday_worked"
  | "weekly_off_worked"
  | "not_applicable";

export interface ManualAttendanceInput {
  employeeId: string;
  date: string;
  status: ManualAttendanceStatus;
  adminId: string;
  approvedById: string;
  reason: string;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  totalMinutes?: number | null;
}

export function combineDateAndTime(date: string, time: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return new Date(year, month - 1, day, hour ?? 0, minute ?? 0, 0, 0);
}

export function minutesBetweenTimes(date: string, checkIn: string, checkOut: string): number {
  const start = combineDateAndTime(date, checkIn);
  const end = combineDateAndTime(date, checkOut);
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}
