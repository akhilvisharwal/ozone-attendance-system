import { getSettings } from "../modules/settings/settings.cache";
import type {
  AttendanceSettings,
  CompanySettings,
  DefaultEmployeeRole,
  EmployeeSettings,
  SecuritySettings,
} from "../modules/settings/settings.types";
import type { LeaveCategoryConfig, LeaveSettings } from "../modules/settings/settings.types";
import { parseIdFormat } from "./employeeCode";
import {
  findLeaveCategoryConfig,
  getEnabledLeaveCategories,
} from "./leaveSettings";

import { env } from "../config/env";
import {
  DEFAULT_PHONE_DIAL_CODE,
  normalizePhoneDialCode,
  sanitizeNationalPhoneNumber,
  splitPhoneNumber,
} from "./phoneCountries";

/** Keep legacy timing fields in sync with admin-facing office start / late check-in. */
export function normalizeAttendanceSettings(a: AttendanceSettings): AttendanceSettings {
  return {
    ...a,
    checkinOpenTime: a.officeStartTime,
    checkinOntimeEnd: a.lateCheckInTime,
  };
}

export function normalizeCompanySettings(company: CompanySettings): CompanySettings {
  const primaryEmail = company.email.trim().toLowerCase();
  const additionalEmails = (company.additionalEmails ?? [])
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index)
    .filter((value) => value !== primaryEmail);

  const primaryPhone = normalizeStoredPhone(company.phone, company.phoneCountryCode);
  const secondaryPhone = normalizeStoredPhone(company.secondaryPhone, company.secondaryPhoneCountryCode);

  return {
    ...company,
    name: env.companyName,
    address: company.address.trim(),
    phoneCountryCode: primaryPhone.dialCode,
    phone: primaryPhone.nationalNumber,
    secondaryPhoneCountryCode: secondaryPhone.dialCode,
    secondaryPhone: secondaryPhone.nationalNumber,
    email: primaryEmail,
    additionalEmails,
  };
}

function normalizeStoredPhone(phone: string | undefined, dialCode: string | undefined) {
  const code = normalizePhoneDialCode(dialCode);
  const trimmed = phone?.trim() ?? "";
  if (!trimmed) {
    return { dialCode: code, nationalNumber: "" };
  }
  if (trimmed.startsWith("+")) {
    return splitPhoneNumber(trimmed, code);
  }
  return { dialCode: code, nationalNumber: sanitizeNationalPhoneNumber(trimmed) };
}

/**
 * Auth role for panel-created accounts is always "employee".
 * Job title / designation is separate (`defaultDesignationId`).
 */
export function resolveEmployeeRoleFromSettings(
  _defaultRole?: DefaultEmployeeRole | null
): "employee" | "admin" {
  return "employee";
}

export function normalizeEmployeeSettings(settings: EmployeeSettings): EmployeeSettings {
  const { prefix, padLength } = parseIdFormat(settings.idFormat);
  const rawDefaultId = settings.defaultDesignationId;
  const defaultDesignationId =
    typeof rawDefaultId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      rawDefaultId.trim()
    )
      ? rawDefaultId.trim()
      : null;

  return {
    ...settings,
    defaultDesignationId,
    // Legacy field kept only for older clients / audit payloads; not used for auth.
    defaultRole: undefined,
    idFormat: `${prefix}${"#".repeat(Math.max(2, Math.min(6, padLength)))}`,
    defaultPassword: settings.defaultPassword.trim(),
    requirePasswordChange: settings.requirePasswordChange ?? true,
    profilePhotoRequired: settings.profilePhotoRequired ?? false,
    activeByDefault: settings.activeByDefault ?? true,
  };
}

export function normalizeSecuritySettings(settings: SecuritySettings): SecuritySettings {
  return {
    ...settings,
    sessionTimeoutMinutes: Math.round(settings.sessionTimeoutMinutes),
    loginAttemptLimit: Math.round(settings.loginAttemptLimit),
    passwordMinLength: Math.round(settings.passwordMinLength),
    passwordExpiryDays: Math.max(0, Math.round(settings.passwordExpiryDays)),
    lockAccountAfterFailedAttempts: settings.lockAccountAfterFailedAttempts ?? true,
    requireSpecialCharacters: settings.requireSpecialCharacters ?? false,
    twoFactorEnabled: false,
  };
}

export function validatePasswordPolicyForSettings(
  password: string,
  settings: SecuritySettings
): string | null {
  if (password.length < settings.passwordMinLength) {
    return `Password must be at least ${settings.passwordMinLength} characters`;
  }
  if (settings.requireUppercase && !/[A-Z]/.test(password)) {
    return "Password must contain at least one uppercase letter";
  }
  if (settings.requireNumbers && !/[0-9]/.test(password)) {
    return "Password must contain at least one number";
  }
  if (settings.requireSpecialCharacters && !/[^A-Za-z0-9]/.test(password)) {
    return "Password must contain at least one special character";
  }
  return null;
}

export function validatePasswordPolicy(password: string): string | null {
  return validatePasswordPolicyForSettings(password, getSettings().security);
}

export function isAccountLockEnabled(): boolean {
  return getSettings().security.lockAccountAfterFailedAttempts ?? true;
}

export function isPasswordExpiredForSettings(
  passwordChangedAt: string | Date | null | undefined,
  settings: SecuritySettings
): boolean {
  const days = settings.passwordExpiryDays;
  if (!days || days <= 0) return false;
  if (!passwordChangedAt) return true;
  const changedAt = passwordChangedAt instanceof Date ? passwordChangedAt : new Date(passwordChangedAt);
  const ageMs = Date.now() - changedAt.getTime();
  return ageMs >= days * 24 * 60 * 60 * 1000;
}

export function isPasswordExpired(passwordChangedAt: string | Date | null | undefined): boolean {
  return isPasswordExpiredForSettings(passwordChangedAt, getSettings().security);
}

export function getSessionTimeoutMinutes(): number {
  return getSettings().security.sessionTimeoutMinutes;
}

export function getLoginAttemptLimit(): number {
  return getSettings().security.loginAttemptLimit;
}

export function getLeaveSettings(): LeaveSettings {
  return getSettings().leave;
}

export function getEnabledLeaveTypes(): string[] {
  return getEnabledLeaveCategories(getLeaveSettings()).map((cat) => cat.name);
}

export function getLeaveLimitForCategory(category: string): number {
  const config = findLeaveCategoryConfig(getLeaveSettings(), category);
  return config?.yearlyLimit ?? 0;
}

export function isValidLeaveCategory(category: string): boolean {
  const config = findLeaveCategoryConfig(getLeaveSettings(), category);
  return Boolean(config?.enabled);
}

export function getLeaveCategoryConfig(category: string): LeaveCategoryConfig | undefined {
  return findLeaveCategoryConfig(getLeaveSettings(), category);
}
