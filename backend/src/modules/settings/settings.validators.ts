import { z } from "zod";

import {
  normalizeAttendanceSettings,
  normalizeEmployeeSettings,
  normalizeSecuritySettings,
  validatePasswordPolicy,
} from "../../utils/settingsHelpers";
import { normalizeMobileSettings } from "../../utils/attendanceCapture";
import { normalizeBackupSettings } from "../../utils/backupHelpers";
import { normalizeExpenseSettings } from "../expenses/expenseSettings";

import type { AttendanceSettings } from "./settings.types";



const hhmm = z.string().regex(/^\d{2}:\d{2}$/);



const attendanceSettingsInputSchema = z

  .object({

    officeStartTime: hhmm,

    lateCheckInTime: hhmm,

    officeClosingTime: hhmm,

    halfDayCutoff: hhmm,

    minHoursPresent: z.number().min(1).max(24),

    minHoursHalfDay: z.number().min(0.5).max(12),

    autoCalculate: z.boolean(),

    allowManualOverride: z.boolean(),

    allowMultipleCheckIns: z.boolean(),

    checkinOpenTime: hhmm.optional(),

    checkinOntimeEnd: hhmm.optional(),

  })

  .superRefine((value, ctx) => {

    if (value.minHoursHalfDay >= value.minHoursPresent) {

      ctx.addIssue({

        code: z.ZodIssueCode.custom,

        message: "Minimum hours for half day must be less than minimum hours for present",

        path: ["minHoursHalfDay"],

      });

    }

    if (value.officeStartTime > value.lateCheckInTime) {

      ctx.addIssue({

        code: z.ZodIssueCode.custom,

        message: "Late check-in time must be at or after office start time",

        path: ["lateCheckInTime"],

      });

    }

    if (value.lateCheckInTime > value.halfDayCutoff) {

      ctx.addIssue({

        code: z.ZodIssueCode.custom,

        message: "Half-day cutoff must be at or after late check-in time",

        path: ["halfDayCutoff"],

      });

    }

    if (value.halfDayCutoff > value.officeClosingTime) {

      ctx.addIssue({

        code: z.ZodIssueCode.custom,

        message: "Office closing time must be at or after half-day cutoff",

        path: ["officeClosingTime"],

      });

    }

  });



export const attendanceSettingsSchema = attendanceSettingsInputSchema.transform((value) =>

  normalizeAttendanceSettings({

    ...value,

    checkinOpenTime: value.officeStartTime,

    checkinOntimeEnd: value.lateCheckInTime,

  } as AttendanceSettings)

);



export const companySettingsSchema = z.object({

  name: z.string().min(1).max(200),

  logoPath: z.string().max(500),

  address: z.string().max(500),

  phone: z.string().min(1, "Primary contact number is required").max(20),

  phoneCountryCode: z.enum(["+91", "+1", "+44", "+971", "+966", "+65", "+61", "+49", "+974"]),

  secondaryPhone: z.string().max(20),

  secondaryPhoneCountryCode: z.enum(["+91", "+1", "+44", "+971", "+966", "+65", "+61", "+49", "+974"]),

  email: z.string().email("Primary email must be valid"),

  additionalEmails: z

    .array(z.string().email("Each additional email must be valid"))

    .max(10),

  gstNumber: z.string().max(20),

  timezone: z.string().min(1).max(64),

  dateFormat: z.string().min(1).max(32),

  timeFormat: z.enum(["12h", "24h"]),

});



export const leaveCategorySchema = z.object({

  name: z.string().min(1).max(80),

  enabled: z.boolean(),

  yearlyLimit: z.number().int().min(0).max(366),

});



export const leaveSettingsSchema = z

  .object({

    categories: z.array(leaveCategorySchema).min(1),

    approvalRequired: z.boolean(),

    halfDayAllowed: z.boolean(),

  })

  .refine((value) => value.categories.some((cat) => cat.enabled), {

    message: "At least one leave category must be enabled",

  });



export const weeklyOffSettingsSchema = z.object({

  defaultWeeklyOffDays: z.array(z.number().int().min(0).max(6)),

});



export const employeeSettingsSchema = z
  .object({
    /** Default job role (employee_designations.id) for newly created employees. */
    defaultDesignationId: z.string().uuid().nullable().optional(),
    /** @deprecated Ignored — auth role is always employee. Accepted for old clients. */
    defaultRole: z.enum(["employee", "manager", "admin"]).optional(),
    idFormat: z
      .string()
      .min(1)
      .max(32)
      .regex(
        /^[A-Za-z0-9]{2,10}#{2,6}$/,
        "ID format must be a 2–10 character prefix followed by 2–6 # placeholders (e.g. OZN### or EMP###)"
      ),
    defaultPassword: z.string().min(6).max(128),
    requirePasswordChange: z.boolean(),
    profilePhotoRequired: z.boolean(),
    activeByDefault: z.boolean(),
  })
  .transform((value) =>
    normalizeEmployeeSettings({
      ...value,
      defaultDesignationId: value.defaultDesignationId ?? null,
    })
  )
  .superRefine((value, ctx) => {
    const policyError = validatePasswordPolicy(value.defaultPassword);
    if (policyError) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: policyError,
        path: ["defaultPassword"],
      });
    }
  });



export const mobileSettingsSchema = z
  .object({
    gpsRequiredCheckIn: z.boolean(),
    gpsRequiredCheckOut: z.boolean(),
    selfieRequiredCheckIn: z.boolean(),
    selfieRequiredCheckOut: z.boolean(),
    allowCameraSwitch: z.boolean(),
    gpsAccuracyThresholdMeters: z.number().int().min(10).max(5000),
    allowOfflineMode: z.boolean(),
    allowDesktopCheckIn: z.boolean(),
  })
  .transform((value) => normalizeMobileSettings(value));



export const reportsSettingsSchema = z.object({

  includeLogo: z.boolean(),

  signatureText: z.string().max(200),

  defaultFormat: z.enum(["pdf", "excel"]),

  autoPageNumbers: z.boolean(),

});



export const securitySettingsSchema = z
  .object({
    sessionTimeoutMinutes: z.number().int().min(5).max(480),
    loginAttemptLimit: z.number().int().min(3).max(20),
    passwordMinLength: z.number().int().min(6).max(128),
    requireUppercase: z.boolean(),
    requireNumbers: z.boolean(),
    requireSpecialCharacters: z.boolean(),
    passwordExpiryDays: z.number().int().min(0).max(365),
    lockAccountAfterFailedAttempts: z.boolean(),
    twoFactorEnabled: z.boolean(),
  })
  .transform((value) => normalizeSecuritySettings(value));



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



export const backupSettingsSchema = z
  .object({
    automaticDailyBackup: z.boolean(),
    lastBackupAt: z.union([z.string().datetime(), z.null()]).optional(),
  })
  .transform((value) => normalizeBackupSettings(value));

export const auditSettingsSchema = z.object({
  retentionDays: z.union([
    z.literal(30),
    z.literal(60),
    z.literal(90),
    z.literal(365),
  ]),
});

const expenseOptionSchema = z.object({
  key: z.string().min(1).max(40),
  label: z.string().min(1).max(80),
  enabled: z.boolean(),
});

export const expenseSettingsSchema = z
  .object({
    cycles: z.object({
      weekly: z.boolean(),
      monthly: z.boolean(),
      custom: z.boolean(),
    }),
    categories: z.array(expenseOptionSchema).min(1),
    paymentMethods: z.array(expenseOptionSchema).min(1),
    maxAmountPerExpense: z.number().positive().max(10_000_000),
    maxAmountPerRequest: z.number().positive().max(50_000_000),
    requireReceiptAbove: z.number().min(0).max(10_000_000),
    autoArchivePaidDays: z.number().int().min(0).max(3650),
    approvalRequired: z.boolean(),
  })
  .superRefine((value, ctx) => {
    if (!value.cycles.weekly && !value.cycles.monthly && !value.cycles.custom) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enable at least one reimbursement cycle",
        path: ["cycles"],
      });
    }
    if (!value.categories.some((item) => item.enabled)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enable at least one category",
        path: ["categories"],
      });
    }
    if (!value.paymentMethods.some((item) => item.enabled)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enable at least one payment method",
        path: ["paymentMethods"],
      });
    }
    if (value.maxAmountPerRequest < value.maxAmountPerExpense) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Per-request limit must be at least the per-expense limit",
        path: ["maxAmountPerRequest"],
      });
    }
  })
  .transform((value) => normalizeExpenseSettings(value));

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
  "backup",
  "audit",
  "expenses",
]);



export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(6).max(128),
    confirmPassword: z.string().min(6).max(128),
    otpChallengeId: z.string().uuid(),
    otpCode: z.string().regex(/^\d{6}$/, "Verification code must be 6 digits"),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: "New password and confirmation do not match",
    path: ["confirmPassword"],
  });



const auditModuleEnum = z.enum([
  "Auth",
  "Employees",
  "Attendance",
  "Leave",
  "Sites",
  "Holidays",
  "Settings",
  "Database",
  "Security",
  "Tasks",
  "Reports",
  "Other",
]);

const auditActionTypeEnum = z.enum([
  "Create",
  "Update",
  "Delete",
  "Login",
  "Logout",
  "Attendance",
  "Leave Approval",
  "Settings Change",
  "Manual Attendance",
  "Task Update",
  "Export",
  "Backup",
  "Restore",
  "Cleanup",
  "Password Change",
  "Other",
]);

export const auditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().max(200).optional(),
  action: z.string().max(100).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  actorId: z.string().uuid().optional(),
  module: auditModuleEnum.optional(),
  actionType: auditActionTypeEnum.optional(),
  status: z.enum(["success", "failed"]).optional(),
});

export const auditClearSchema = z.object({
  confirmation: z.literal("DELETE", {
    errorMap: () => ({ message: "Type DELETE to confirm clearing all audit logs" }),
  }),
  otpChallengeId: z.string().uuid(),
  otpCode: z.string().regex(/^\d{6}$/, "Verification code must be 6 digits"),
});

export const auditExportFormatSchema = z.enum(["pdf", "excel"]);



const cleanupCategorySchema = z.enum([
  "attendance_records",
  "selfies",
  "location_history",
  "audit_logs",
  "archived_expenses",
]);

export const cleanupConfirmSchema = z.object({
  category: cleanupCategorySchema,
  confirmation: z.literal("DELETE", {
    errorMap: () => ({ message: "Type DELETE to confirm this cleanup action" }),
  }),
  otpChallengeId: z.string().uuid(),
  otpCode: z.string().regex(/^\d{6}$/, "Verification code must be 6 digits"),
});

export const databaseResetPrepareSchema = z.object({
  confirmation: z.literal("RESET", {
    errorMap: () => ({ message: "Type RESET to confirm this irreversible action" }),
  }),
  otpChallengeId: z.string().uuid(),
  otpCode: z.string().regex(/^\d{6}$/, "Verification code must be 6 digits"),
});

export const databaseResetExecuteSchema = z.object({
  confirmation: z.literal("RESET", {
    errorMap: () => ({ message: "Type RESET to confirm this irreversible action" }),
  }),
  authorizationId: z.string().uuid(),
  authorizationToken: z.string().min(32).max(200),
  otpChallengeId: z.string().uuid(),
  otpCode: z.string().regex(/^\d{6}$/, "Verification code must be 6 digits"),
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

  backup: backupSettingsSchema,

  audit: auditSettingsSchema,

  expenses: expenseSettingsSchema,

} as const;



export function parseCategorySettings(category: keyof typeof schemaByCategory, body: unknown) {

  return schemaByCategory[category].parse(body);

}


