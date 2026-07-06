import { getSettings } from "../modules/settings/settings.cache";
import type { AttendanceSettings } from "../modules/settings/settings.types";

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

export function getLeaveLimitForCategory(category: string): number {
  const leave = getSettings().leave;
  const key = category.toLowerCase();
  if (key.includes("annual")) return leave.annualLimit;
  if (key.includes("sick")) return leave.sickLimit;
  if (key.includes("casual")) return leave.casualLimit;
  return leave.annualLimit;
}

export function isValidLeaveCategory(category: string): boolean {
  return getSettings().leave.leaveTypes.some((t) => t.toLowerCase() === category.toLowerCase());
}
