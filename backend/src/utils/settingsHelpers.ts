import { getSettings } from "../modules/settings/settings.cache";
import type { AttendanceSettings } from "../modules/settings/settings.types";
import type { LeaveCategoryConfig, LeaveSettings } from "../modules/settings/settings.types";
import {
  findLeaveCategoryConfig,
  getEnabledLeaveCategories,
} from "./leaveSettings";

/** Keep legacy timing fields in sync with admin-facing office start / late check-in. */
export function normalizeAttendanceSettings(a: AttendanceSettings): AttendanceSettings {
  return {
    ...a,
    checkinOpenTime: a.officeStartTime,
    checkinOntimeEnd: a.lateCheckInTime,
  };
}

export function validatePasswordPolicy(password: string): string | null {
  const s = getSettings().security;
  if (password.length < s.passwordMinLength) {
    return `Password must be at least ${s.passwordMinLength} characters`;
  }
  if (s.requireUppercase && !/[A-Z]/.test(password)) {
    return "Password must contain at least one uppercase letter";
  }
  if (s.requireNumbers && !/[0-9]/.test(password)) {
    return "Password must contain at least one number";
  }
  return null;
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
