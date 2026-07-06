import { env } from "../../config/env";

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

export interface LeaveSettings {
  leaveTypes: string[];
  annualLimit: number;
  sickLimit: number;
  casualLimit: number;
  approvalRequired: boolean;
  halfDayAllowed: boolean;
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
  | "appearance";

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

export function buildDefaultSettings(): AppSettings {
  return {
    company: {
      name: env.companyName,
      logoPath: env.companyLogoPath,
      address: "",
      phone: "",
      email: env.adminEmail,
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
      leaveTypes: ["Annual", "Sick", "Casual"],
      annualLimit: 12,
      sickLimit: 6,
      casualLimit: 6,
      approvalRequired: true,
      halfDayAllowed: true,
    },
    weeklyOff: {
      defaultWeeklyOffDays: [0],
    },
    employee: {
      defaultRole: "employee",
      idFormat: "OZN###",
      defaultPassword: env.adminPassword,
      requirePasswordChange: true,
      profilePhotoRequired: false,
    },
    mobile: {
      gpsRequiredCheckIn: true,
      gpsRequiredCheckOut: false,
      selfieRequiredCheckIn: true,
      selfieRequiredCheckOut: false,
      allowCameraSwitch: true,
      gpsAccuracyThresholdMeters: 100,
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
];
