export interface CompanySettings {
  name: string;
  logoPath: string;
  address: string;
  phone: string;
  email: string;
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

export interface EmployeeSettings {
  defaultRole: "employee" | "admin";
  idFormat: string;
  defaultPassword: string;
  requirePasswordChange: boolean;
  profilePhotoRequired: boolean;
}

export interface MobileSettings {
  gpsRequiredCheckIn: boolean;
  gpsRequiredCheckOut: boolean;
  selfieRequiredCheckIn: boolean;
  selfieRequiredCheckOut: boolean;
  allowCameraSwitch: boolean;
  gpsAccuracyThresholdMeters: number;
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
}

export type SettingsCategory = keyof AppSettings;

export interface PublicSettings {
  company: Pick<CompanySettings, "name" | "logoPath" | "timeFormat" | "timezone" | "dateFormat">;
  mobile: MobileSettings;
  appearance: Pick<AppearanceSettings, "theme" | "accentColor" | "sidebarCollapsed">;
  leave: Pick<LeaveSettings, "halfDayAllowed" | "approvalRequired"> & {
    categories: PublicLeaveCategory[];
  };
  weeklyOff: WeeklyOffSettings;
  employee: Pick<EmployeeSettings, "idFormat" | "profilePhotoRequired">;
  attendance: Pick<AttendanceSettings, "allowManualOverride" | "minHoursPresent" | "minHoursHalfDay">;
  reports: Pick<ReportsSettings, "defaultFormat">;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
  actor_name: string | null;
  actor_code: string | null;
}

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const SETTINGS_NAV: { id: SettingsCategory | "audit" | "backup"; label: string; group?: string }[] = [
  { id: "company", label: "Company", group: "General" },
  { id: "appearance", label: "Appearance", group: "General" },
  { id: "attendance", label: "Attendance", group: "Operations" },
  { id: "leave", label: "Leave", group: "Operations" },
  { id: "weeklyOff", label: "Weekly Off & Holidays", group: "Operations" },
  { id: "employee", label: "Employees", group: "Operations" },
  { id: "mobile", label: "Mobile Attendance", group: "Operations" },
  { id: "reports", label: "Reports & PDF", group: "Operations" },
  { id: "notifications", label: "Notifications", group: "Communications" },
  { id: "security", label: "Security", group: "Administration" },
  { id: "backup", label: "Backup & Data", group: "Administration" },
  { id: "audit", label: "Audit Logs", group: "Administration" },
];
