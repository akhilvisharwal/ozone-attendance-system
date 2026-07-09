export interface CompanySettings {
  name: string;
  logoPath: string;
  address: string;
  phone: string;
  phoneCountryCode: string;
  secondaryPhone: string;
  secondaryPhoneCountryCode: string;
  email: string;
  additionalEmails: string[];
  gstNumber: string;
  timezone: string;
  dateFormat: string;
  timeFormat: "12h" | "24h";
}

export interface AttendanceSettings {
  officeStartTime: string;
  lateCheckInTime: string;
  officeClosingTime: string;
  minHoursPresent: number;
  minHoursHalfDay: number;
  autoCalculate: boolean;
  allowManualOverride: boolean;
  allowMultipleCheckIns: boolean;
  checkinOpenTime: string;
  checkinOntimeEnd: string;
  halfDayCutoff: string;
}

export interface AttendanceOverrideNotice {
  id: string;
  startDate: string;
  endDate: string;
  reason: string;
}

export type AttendanceOverrideStatus = "active" | "upcoming" | "expired";

export interface OverrideEmployeeSummary {
  id: string;
  employeeCode: string;
  name: string;
}

export interface AttendanceDailyOverride {
  id: string;
  startDate: string;
  endDate: string;
  reason: string;
  officeStartTime: string | null;
  lateCheckInTime: string | null;
  halfDayCutoff: string | null;
  officeClosingTime: string | null;
  minHoursPresent: number | null;
  minHoursHalfDay: number | null;
  isEnabled: boolean;
  applyToAll: boolean;
  employees: OverrideEmployeeSummary[];
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export const ATTENDANCE_OVERRIDE_REASON_PRESETS = [
  "Heavy Rain",
  "Flood",
  "Public Transport Strike",
  "Extreme Weather",
  "Festival",
  "Emergency",
] as const;

export interface LeaveCategoryConfig {
  name: string;
  enabled: boolean;
  yearlyLimit: number;
}

export interface LeaveSettings {
  categories: LeaveCategoryConfig[];
  approvalRequired: boolean;
  halfDayAllowed: boolean;
}

export interface PublicLeaveCategory {
  name: string;
  yearlyLimit: number;
}

export interface WeeklyOffSettings {
  defaultWeeklyOffDays: number[];
}

/** @deprecated Auth role is always employee. Use defaultDesignationId for job roles. */
export type DefaultEmployeeRole = "employee" | "manager" | "admin";

export interface EmployeeSettings {
  /** Default job role / designation (employee_designations.id) for new employees. */
  defaultDesignationId: string | null;
  /** @deprecated Ignored for account creation. */
  defaultRole?: DefaultEmployeeRole;
  idFormat: string;
  defaultPassword: string;
  requirePasswordChange: boolean;
  profilePhotoRequired: boolean;
  activeByDefault: boolean;
}

export interface MobileSettings {
  gpsRequiredCheckIn: boolean;
  gpsRequiredCheckOut: boolean;
  selfieRequiredCheckIn: boolean;
  selfieRequiredCheckOut: boolean;
  allowCameraSwitch: boolean;
  gpsAccuracyThresholdMeters: number;
  allowOfflineMode: boolean;
  allowDesktopCheckIn: boolean;
}

export interface ReportsSettings {
  includeLogo: boolean;
  signatureText: string;
  defaultFormat: "pdf" | "excel";
  autoPageNumbers: boolean;
}

export interface SecuritySettings {
  sessionTimeoutMinutes: number;
  loginAttemptLimit: number;
  passwordMinLength: number;
  requireUppercase: boolean;
  requireNumbers: boolean;
  requireSpecialCharacters: boolean;
  passwordExpiryDays: number;
  lockAccountAfterFailedAttempts: boolean;
  twoFactorEnabled: boolean;
}

export interface NotificationSettings {
  emailEnabled: boolean;
  leaveApproval: boolean;
  attendanceReminder: boolean;
  holidayNotifications: boolean;
}

export interface AppearanceSettings {
  theme: "light" | "dark" | "system";
  accentColor: string;
  sidebarCollapsed: boolean;
}

export interface BackupSettings {
  automaticDailyBackup: boolean;
  lastBackupAt: string | null;
}

export type AuditRetentionDays = 30 | 60 | 90 | 365;

export interface AuditSettings {
  retentionDays: AuditRetentionDays;
}

export type AuditModule =
  | "Auth"
  | "Employees"
  | "Attendance"
  | "Leave"
  | "Sites"
  | "Holidays"
  | "Settings"
  | "Database"
  | "Security"
  | "Tasks"
  | "Reports"
  | "Other";

export type AuditActionType =
  | "Create"
  | "Update"
  | "Delete"
  | "Login"
  | "Logout"
  | "Attendance"
  | "Leave Approval"
  | "Settings Change"
  | "Manual Attendance"
  | "Task Update"
  | "Export"
  | "Backup"
  | "Restore"
  | "Cleanup"
  | "Password Change"
  | "Other";

export type AuditStatus = "success" | "failed";

export interface AppSettings {
  company: CompanySettings;
  attendance: AttendanceSettings;
  leave: LeaveSettings;
  weeklyOff: WeeklyOffSettings;
  employee: EmployeeSettings;
  mobile: MobileSettings;
  reports: ReportsSettings;
  security: SecuritySettings;
  notifications: NotificationSettings;
  appearance: AppearanceSettings;
  backup: BackupSettings;
  audit: AuditSettings;
}

export type SettingsCategory = keyof AppSettings;

export interface DatabaseStatus {
  health: "healthy" | "unhealthy";
  databaseSizeBytes: number;
  databaseSizeLabel: string;
  totalEmployees: number;
  totalAttendanceRecords: number;
}

export type CleanupTarget =
  | "attendance_records"
  | "attendance_selfies"
  | "attendance_location"
  | "attendance_bundle"
  | "audit_logs";

export interface StorageCategory {
  id: string;
  label: string;
  recordCount: number;
  sizeBytes: number | null;
  sizeLabel: string;
  percentOfTotal: number | null;
  description: string;
}

export interface StorageTableStat {
  name: string;
  recordCount: number;
  sizeBytes: number;
  sizeLabel: string;
  percentOfTotal: number;
}

export interface CleanupPreviewItem {
  label: string;
  description: string;
  affectedRecords: number;
  details: string[];
}

export type StorageLimitSource = "provider" | "env" | "unavailable";
export type StorageWarningLevel = "none" | "warning" | "high" | "critical";

export interface StorageCapacity {
  usedBytes: number;
  usedLabel: string;
  maxBytes: number | null;
  maxLabel: string;
  remainingBytes: number | null;
  remainingLabel: string;
  percentUsed: number | null;
  limitSource: StorageLimitSource;
  limitDescription: string;
  capacityGb: number | null;
  detected: boolean;
  warningLevel: StorageWarningLevel;
  warnings: string[];
}

export interface StorageBreakdown {
  databaseSizeBytes: number;
  databaseSizeLabel: string;
  totalTrackedBytes: number;
  totalTrackedLabel: string;
  capacity: StorageCapacity;
  categories: StorageCategory[];
  tables: StorageTableStat[];
  cleanupPreview: Record<CleanupTarget, CleanupPreviewItem>;
}

export interface BackupStatusResponse {
  status: DatabaseStatus;
  backup: BackupSettings;
  storage?: StorageBreakdown;
}

export interface DatabasePanelResponse {
  status: DatabaseStatus;
  storage: StorageBreakdown;
}

export interface CleanupResultResponse {
  success: boolean;
  result: {
    target: CleanupTarget;
    deletedRecords: number;
    deletedFiles: number;
    details: Record<string, number>;
  };
  status: DatabaseStatus;
  storage: StorageBreakdown;
  backup: BackupSettings;
}

export interface PublicSettings {
  company: Pick<
    CompanySettings,
    | "name"
    | "logoPath"
    | "timeFormat"
    | "timezone"
    | "dateFormat"
    | "address"
    | "phone"
    | "phoneCountryCode"
    | "secondaryPhone"
    | "secondaryPhoneCountryCode"
    | "email"
    | "additionalEmails"
  >;
  mobile: MobileSettings;
  appearance: Pick<AppearanceSettings, "theme" | "accentColor" | "sidebarCollapsed">;
  leave: Pick<LeaveSettings, "halfDayAllowed" | "approvalRequired"> & {
    categories: PublicLeaveCategory[];
  };
  weeklyOff: WeeklyOffSettings;
  employee: Pick<EmployeeSettings, "idFormat" | "profilePhotoRequired">;
  attendance: AttendanceSettings;
  attendanceOverride?: AttendanceOverrideNotice | null;
  reports: Pick<ReportsSettings, "defaultFormat">;
  maps: {
    /** Browser Maps JavaScript API key (referrer-restricted; safe to expose to clients). */
    apiKey: string;
  };
}

export interface AuditLogEntry {
  id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  status: AuditStatus;
  created_at: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_code: string | null;
  actor_role: string | null;
  module: AuditModule;
  action_type: AuditActionType;
  action_label: string;
  description: string;
}

export interface AuditLogsResponse {
  logs: AuditLogEntry[];
  total: number;
  page: number;
  limit: number;
  retentionDays: AuditRetentionDays;
  totalAll: number;
  modules: AuditModule[];
  actionTypes: AuditActionType[];
  retentionOptions: AuditRetentionDays[];
}

export interface AuditLogFilters {
  page?: number;
  limit?: number;
  search?: string;
  from?: string;
  to?: string;
  actorId?: string;
  module?: AuditModule | "";
  actionType?: AuditActionType | "";
  status?: AuditStatus | "";
  action?: string;
}

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export const WEEKDAY_OPTIONS = WEEKDAY_LABELS.map((label, value) => ({
  value,
  label,
  longLabel: [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ][value],
}));

export type SettingsTabId =
  | "company"
  | "attendance"
  | "weeklyOff"
  | "employee"
  | "mobile"
  | "notifications"
  | "security"
  | "backup"
  | "database"
  | "audit";

export const SETTINGS_NAV: {
  id: SettingsTabId;
  label: string;
  description: string;
  group: string;
}[] = [
  { id: "company", label: "Company", description: "Organization profile and branding", group: "General" },
  { id: "attendance", label: "Attendance", description: "Check-in rules and attendance policies", group: "Operations" },
  { id: "weeklyOff", label: "Weekly Off & Holidays", description: "Default weekly off and related links", group: "Operations" },
  { id: "employee", label: "Employees", description: "Employee defaults and ID format", group: "Operations" },
  { id: "mobile", label: "Attendance Capture", description: "GPS, selfie, and capture rules for mobile and web", group: "Operations" },
  { id: "notifications", label: "Notifications", description: "Email and in-app notification toggles", group: "Communications" },
  { id: "security", label: "Security", description: "Password policy and session controls", group: "Administration" },
  { id: "backup", label: "Backup & Data", description: "Backup, restore, and data export", group: "Administration" },
  { id: "database", label: "Database", description: "Storage monitoring, cleanup, and maintenance", group: "Administration" },
  {
    id: "audit",
    label: "Audit Logs",
    description: "Searchable history of important system actions",
    group: "Administration",
  },
];
