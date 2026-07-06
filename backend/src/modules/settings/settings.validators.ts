import { z } from "zod";

const hhmm = z.string().regex(/^\d{2}:\d{2}$/);

export const companySettingsSchema = z.object({
  name: z.string().min(1).max(200),
  logoPath: z.string().max(500),
  address: z.string().max(500),
  phone: z.string().max(30),
  email: z.string().email().or(z.literal("")),
  gstNumber: z.string().max(20),
  timezone: z.string().min(1).max(64),
  dateFormat: z.string().min(1).max(32),
  timeFormat: z.enum(["12h", "24h"]),
});

export const attendanceSettingsSchema = z.object({
  officeStartTime: hhmm,
  lateCheckInTime: hhmm,
  officeClosingTime: hhmm,
  minHoursPresent: z.number().min(1).max(24),
  minHoursHalfDay: z.number().min(0.5).max(12),
  autoCalculate: z.boolean(),
  allowManualOverride: z.boolean(),
  allowMultipleCheckIns: z.boolean(),
  checkinOpenTime: hhmm,
  checkinOntimeEnd: hhmm,
  halfDayCutoff: hhmm,
});

export const leaveSettingsSchema = z.object({
  leaveTypes: z.array(z.string().min(1).max(50)).min(1),
  annualLimit: z.number().int().min(0).max(365),
  sickLimit: z.number().int().min(0).max(365),
  casualLimit: z.number().int().min(0).max(365),
  approvalRequired: z.boolean(),
  halfDayAllowed: z.boolean(),
});

export const weeklyOffSettingsSchema = z.object({
  defaultWeeklyOffDays: z.array(z.number().int().min(0).max(6)),
});

export const employeeSettingsSchema = z.object({
  defaultRole: z.enum(["employee", "admin"]),
  idFormat: z.string().min(1).max(32),
  defaultPassword: z.string().min(6).max(128),
  requirePasswordChange: z.boolean(),
  profilePhotoRequired: z.boolean(),
});

export const mobileSettingsSchema = z.object({
  gpsRequiredCheckIn: z.boolean(),
  gpsRequiredCheckOut: z.boolean(),
  selfieRequiredCheckIn: z.boolean(),
  selfieRequiredCheckOut: z.boolean(),
  allowCameraSwitch: z.boolean(),
  gpsAccuracyThresholdMeters: z.number().int().min(10).max(5000),
});

export const reportsSettingsSchema = z.object({
  includeLogo: z.boolean(),
  signatureText: z.string().max(200),
  defaultFormat: z.enum(["pdf", "excel"]),
  autoPageNumbers: z.boolean(),
});

export const securitySettingsSchema = z.object({
  sessionTimeoutMinutes: z.number().int().min(5).max(480),
  loginAttemptLimit: z.number().int().min(3).max(20),
  passwordMinLength: z.number().int().min(6).max(128),
  requireUppercase: z.boolean(),
  requireNumbers: z.boolean(),
  twoFactorEnabled: z.boolean(),
});

export const notificationSettingsSchema = z.object({
  emailEnabled: z.boolean(),
  leaveApproval: z.boolean(),
  attendanceReminder: z.boolean(),
  holidayNotifications: z.boolean(),
});

export const appearanceSettingsSchema = z.object({
  theme: z.enum(["light", "dark", "system"]),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  sidebarCollapsed: z.boolean(),
});

export const categoryParamSchema = z.enum([
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
]);

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6).max(128),
});

export const auditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  action: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

const schemaByCategory = {
  company: companySettingsSchema,
  attendance: attendanceSettingsSchema,
  leave: leaveSettingsSchema,
  weeklyOff: weeklyOffSettingsSchema,
  employee: employeeSettingsSchema,
  mobile: mobileSettingsSchema,
  reports: reportsSettingsSchema,
  security: securitySettingsSchema,
  notifications: notificationSettingsSchema,
  appearance: appearanceSettingsSchema,
} as const;

export function parseCategorySettings(category: keyof typeof schemaByCategory, body: unknown) {
  return schemaByCategory[category].parse(body);
}
