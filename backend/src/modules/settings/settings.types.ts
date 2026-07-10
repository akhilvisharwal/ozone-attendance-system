import { env } from "../../config/env";
import { buildDefaultLeaveCategories } from "../../utils/leaveSettings";
import { buildDefaultExpenseSettings, type ExpenseSettings } from "../expenses/expenseSettings";

export type { ExpenseSettings };

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

export interface WeeklyOffSettings {
  defaultWeeklyOffDays: number[];
}

/** @deprecated Auth role is always employee for panel-created accounts. Kept for old settings JSON. */
export type DefaultEmployeeRole = "employee" | "manager" | "admin";

export interface EmployeeSettings {
  /**
   * Default job role / designation for newly created employees
   * (FK to employee_designations.id). Auth role remains "employee".
   */
  defaultDesignationId: string | null;
  /** @deprecated Use defaultDesignationId. Ignored for account creation. */
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

export interface BackupSettings {
  // NOTE: database plan capacity is detected automatically (provider API / env),
  // it is no longer stored in settings.
  automaticDailyBackup: boolean;
  lastBackupAt: string | null;
}

export type AuditRetentionDays = 30 | 60 | 90 | 365;

export interface AuditSettings {
  /** Automatically delete audit logs older than this many days. */
  retentionDays: AuditRetentionDays;
}

export interface AppearanceSettings {
  theme: "light" | "dark" | "system";
  accentColor: string;
  sidebarCollapsed: boolean;
}

export type SettingsCategory =
  | "company"
  | "attendance"
  | "leave"
  | "weeklyOff"
  | "employee"
  | "mobile"
  | "reports"
  | "security"
  | "notifications"
  | "appearance"
  | "backup"
  | "audit"
  | "expenses";

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
  expenses: ExpenseSettings;
}

export function buildDefaultSettings(): AppSettings {
  return {
    company: {
      name: env.companyName,
      logoPath: env.companyLogoPath,
      address: "",
      phone: "",
      phoneCountryCode: "+91",
      secondaryPhone: "",
      secondaryPhoneCountryCode: "+91",
      email: env.adminEmail,
      additionalEmails: [],
      gstNumber: "",
      timezone: env.timezone,
      dateFormat: "DD/MM/YYYY",
      timeFormat: "12h",
    },
    attendance: {
      officeStartTime: env.officeStartTime.slice(0, 5),
      lateCheckInTime: env.checkinOntimeEnd,
      officeClosingTime: env.checkoutStandardTime,
      minHoursPresent: 8,
      minHoursHalfDay: 3,
      autoCalculate: true,
      allowManualOverride: true,
      allowMultipleCheckIns: false,
      checkinOpenTime: env.checkinOpenTime,
      checkinOntimeEnd: env.checkinOntimeEnd,
      halfDayCutoff: env.halfDayCutoff,
    },
    leave: {
      categories: buildDefaultLeaveCategories(),
      approvalRequired: true,
      halfDayAllowed: true,
    },
    weeklyOff: {
      defaultWeeklyOffDays: [0],
    },
    employee: {
      defaultDesignationId: null,
      idFormat: "OZN###",
      defaultPassword: env.adminPassword,
      requirePasswordChange: true,
      profilePhotoRequired: false,
      activeByDefault: true,
    },
    mobile: {
      gpsRequiredCheckIn: true,
      gpsRequiredCheckOut: true,
      selfieRequiredCheckIn: true,
      selfieRequiredCheckOut: false,
      allowCameraSwitch: true,
      gpsAccuracyThresholdMeters: 100,
      allowOfflineMode: false,
      allowDesktopCheckIn: true,
    },
    reports: {
      includeLogo: true,
      signatureText: "",
      defaultFormat: "pdf",
      autoPageNumbers: true,
    },
    security: {
      sessionTimeoutMinutes: 15,
      loginAttemptLimit: 5,
      passwordMinLength: 8,
      requireUppercase: true,
      requireNumbers: true,
      requireSpecialCharacters: false,
      passwordExpiryDays: 0,
      lockAccountAfterFailedAttempts: true,
      twoFactorEnabled: false,
    },
    notifications: {
      emailEnabled: false,
      leaveApproval: true,
      attendanceReminder: false,
      holidayNotifications: true,
    },
    appearance: {
      theme: "light",
      accentColor: "#2563eb",
      sidebarCollapsed: false,
    },
    backup: {
      automaticDailyBackup: false,
      lastBackupAt: null,
    },
    audit: {
      retentionDays: 90,
    },
    expenses: buildDefaultExpenseSettings(),
  };
}

export const SETTINGS_CATEGORIES: SettingsCategory[] = [
  "company",
  "attendance",
  "leave",
  "weeklyOff",
  "employee",
  "mobile",
  "reports",
  "security",
  "notifications",
  "appearance",
  "backup",
  "audit",
  "expenses",
];
