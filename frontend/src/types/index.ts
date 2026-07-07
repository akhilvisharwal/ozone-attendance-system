export type Role = "admin" | "employee";

export interface Employee {
  id: string;
  employee_code: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  is_active: boolean;
  must_change_password: boolean;
  profile_photo_path: string | null;
  created_by: string | null;
  deleted_at?: string | null;
  weekly_off_days?: number[];
  department?: string | null;
  created_at: string;
  updated_at: string;
}

export type TaskStatus = "not_started" | "in_progress" | "on_hold" | "completed";
export type TaskPriority = "low" | "medium" | "high";

export interface TaskGroupAssignee {
  task_id: string;
  employee_id: string;
  employee_name: string;
  employee_code: string;
  status: TaskStatus;
  progress_remarks: string | null;
  is_overdue: boolean;
}

export interface TaskGroupSummary {
  group_id: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  site_id: string | null;
  site_name: string | null;
  start_date: string | null;
  due_date: string | null;
  effective_due_date: string | null;
  expected_duration_days: number;
  assigned_by_name: string | null;
  assignee_count: number;
  completed_count: number;
  completion_percentage: number;
  is_overdue: boolean;
  assignees: TaskGroupAssignee[];
  created_at: string;
  updated_at: string;
}

export interface TaskGroupDetail {
  group: TaskGroupSummary;
  attachments: TaskAttachment[];
  comments: TaskComment[];
  assignees: TaskGroupAssignee[];
  extensions?: TaskExtensionRequest[];
}

export interface Task {
  id: string;
  employee_id: string;
  employee_name?: string;
  employee_code?: string;
  assigned_by: string | null;
  assigned_by_name?: string | null;
  attendance_date: string | null;
  title: string;
  description: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  completed_at: string | null;
  site_id: string | null;
  site_name?: string | null;
  start_date: string | null;
  due_date: string | null;
  extended_due_date: string | null;
  effective_due_date?: string | null;
  expected_duration_days: number;
  progress_remarks: string | null;
  group_id: string | null;
  is_overdue?: boolean;
  assignee_count?: number;
  completed_count?: number;
  completion_percentage?: number;
  created_at: string;
  updated_at: string;
}

export interface TaskAttachment {
  id: string;
  task_group_id: string;
  file_path: string;
  file_name: string;
  mime_type: string;
  file_size: number | null;
  uploaded_by: string | null;
  uploaded_by_name?: string | null;
  created_at: string;
}

export interface TaskComment {
  id: string;
  task_group_id: string;
  author_id: string;
  author_name?: string;
  body: string;
  created_at: string;
}

export interface TaskExtensionRequest {
  id: string;
  task_id: string;
  requested_due_date: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  reviewed_by: string | null;
  reviewed_at: string | null;
  admin_remarks: string | null;
  created_at: string;
  updated_at: string;
  employee_name?: string;
  task_title?: string;
}

export interface TaskAnalytics {
  total: number;
  not_started: number;
  in_progress: number;
  on_hold: number;
  completed: number;
  overdue: number;
  completion_percentage: number;
}

export interface TaskTeamMember {
  employee_id: string;
  employee_name: string;
  employee_code: string;
  status: TaskStatus;
  is_current_user?: boolean;
}

export interface TaskDetail {
  task: Task;
  attachments: TaskAttachment[];
  comments: TaskComment[];
  assignees?: Task[];
  teamMembers?: TaskTeamMember[];
  isGroupTask?: boolean;
  assigneeCount?: number;
  extensions?: TaskExtensionRequest[];
}

export interface AppNotification {
  id: string;
  employee_id: string;
  type: string;
  title: string;
  body: string | null;
  link_path: string | null;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
}

export interface ScoreboardEntry {
  employee_id: string;
  employee_code: string;
  name: string;
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

export type WorkStatus = "completed" | "in_progress" | "pending" | "on_hold" | "cancelled";
export type AttendanceStatus = "checked_in" | "checked_out" | "absent";
export type SiteType = "office" | "project";
export type CheckInStatus  = "early" | "on_time" | "late" | "half_day";
export type CheckOutStatus = "early" | "on_time" | "overtime";
export type DayStatus      = "present" | "half_day" | "absent";
export type LeaveType   = "full" | "half";
export type LeaveStatus = "pending" | "approved" | "rejected";

export interface LeaveRequest {
  id: string;
  employee_id: string;
  employee_name?: string;
  employee_code?: string;
  reviewed_by_name?: string | null;
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

export interface TimingRules {
  checkinOpenTime: string;
  checkinOntimeEnd: string;
  halfDayCutoff: string;
  checkoutStandardTime: string;
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
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DependencyCounts {
  attendance: number;
  leaves: number;
  tasks: number;
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

  is_admin_marked: boolean;
  admin_marked_by: string | null;
  admin_mark_reason: string | null;

  site_name?: string | null;

  created_at: string;
  updated_at: string;
}

export interface AdminAttendanceRow extends AttendanceRecord {
  employee_code: string;
  employee_name: string;
  site_name: string | null;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface DashboardSummary {
  totalEmployees: number;
  presentToday: number;
  halfDayToday: number;
  absentToday: number;
  lateArrivals: number;
  currentlyCheckedIn: number;
  checkedOutToday: number;
}

// ─── Monthly attendance grid ───────────────────────────────────────────────
export type MonthlyCellStatus =
  | "present"
  | "half_day"
  | "absent"
  | "leave"
  | "weekly_off"
  | "holiday"
  | "holiday_worked"
  | "none";

export interface MonthlyDayCell {
  day: number;
  date: string;
  status: MonthlyCellStatus;
  totalMinutes: number | null;
  late: boolean;
  holidayName: string | null;
}

export interface MonthlySummary {
  present: number;
  halfDay: number;
  absent: number;
  leave: number;
  weeklyOff: number;
  holidays: number;
  holidayWorked: number;
  totalMinutes: number;
  workingDays: number;
  attendancePercentage: number;
  lateCheckIns: number;
}

export interface MonthlyEmployeeRow {
  employeeId: string;
  employeeCode: string;
  name: string;
  department: string | null;
  weeklyOffDays: number[];
  days: MonthlyDayCell[];
  summary: MonthlySummary;
}

export interface MonthlyGrid {
  year: number;
  month: number;
  label: string;
  daysInMonth: number;
  employees: MonthlyEmployeeRow[];
  holidays: { date: string; name: string; description: string | null }[];
}

export interface ApiErrorShape {
  error: {
    message: string;
    details?: unknown;
  };
}
