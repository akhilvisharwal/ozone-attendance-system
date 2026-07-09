export type Role = "admin" | "employee";

export interface Employee {
  id: string;
  employee_code: string;
  name: string;
  email: string | null;
  phone: string | null;
  department: string | null;
  designation_id: string | null;
  designation?: string | null;
  password_hash: string;
  role: Role;
  is_active: boolean;
  must_change_password: boolean;
  password_changed_at?: string | null;
  profile_photo_path: string | null;
  created_by: string | null;
  deleted_at: string | null;
  weekly_off_days: number[];
  uses_default_weekly_off: boolean;
  created_at: string;
  updated_at: string;
}

export type TaskStatus = "not_started" | "in_progress" | "on_hold" | "completed";
export type TaskPriority = "low" | "medium" | "high";

export interface Task {
  id: string;
  employee_id: string;
  assigned_by: string | null;
  attendance_date: string | null;
  title: string;
  description: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScoreboardEntry {
  employee_id: string;
  employee_code: string;
  name: string;
  designation?: string | null;
  profile_photo_path: string | null;
  total_days_present: number;
  half_days: number;
  absent_days: number;
  late_arrivals: number;
  leave_days: number;
  total_tasks: number;
  completed_tasks: number;
  score: number;
}

export type PublicEmployee = Omit<Employee, "password_hash">;

export interface JwtAccessPayload {
  sub: string; // employee id
  employeeCode: string;
  role: Role;
  tokenType: "access";
}

export interface JwtRefreshPayload {
  sub: string;
  tokenType: "refresh";
  jti: string;
}

export type WorkStatus = "completed" | "in_progress" | "pending" | "on_hold" | "cancelled";
export type AttendanceStatus = "checked_in" | "checked_out" | "absent";
export type SiteType = "office" | "project";
export type CheckInStatus  = "early" | "on_time" | "late" | "half_day";
export type CheckOutStatus = "early" | "on_time" | "overtime";
export type DayStatus      = "present" | "half_day" | "absent";
export type SpecialDayStatus = "weekly_off_worked" | "holiday_worked";
export type LeaveType      = "full" | "half";
export type LeaveStatus    = "pending" | "approved" | "rejected";

export interface LeaveRequest {
  id: string;
  employee_id: string;
  leave_date: string;
  leave_type: LeaveType;
  leave_category: string;
  reason: string;
  status: LeaveStatus;
  reviewed_by: string | null;
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Site {
  id: string;
  name: string;
  type: SiteType;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  radius_meters: number | null;
  image_path: string | null;
  is_active: boolean;
  created_by: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AttendanceRecord {
  id: string;
  employee_id: string;
  attendance_date: string;

  check_in_time: string | null;
  check_in_latitude: number | null;
  check_in_longitude: number | null;
  check_in_address: string | null;
  check_in_selfie_path: string | null;
  check_in_device_info: string | null;

  check_out_time: string | null;
  check_out_latitude: number | null;
  check_out_longitude: number | null;
  check_out_address: string | null;
  check_out_gps_accuracy: number | null;

  site_id: string | null;
  work_summary: string | null;
  work_status: WorkStatus | null;
  remarks: string | null;
  site_photo_paths: string[];

  total_minutes: number | null;
  status: AttendanceStatus;
  day_status: DayStatus | null;
  check_in_status: CheckInStatus | null;
  is_half_day: boolean;
  check_out_status: CheckOutStatus | null;

  special_day_status: SpecialDayStatus | null;

  is_admin_marked: boolean;
  admin_marked_by: string | null;
  admin_mark_reason: string | null;
  admin_mark_status: string | null;
  admin_approved_by: string | null;

  created_at: string;
  updated_at: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        employeeCode: string;
        role: Role;
      };
    }
  }
}
