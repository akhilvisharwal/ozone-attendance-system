import { getLoginAttemptLimit } from "./settingsHelpers";

interface AttemptRecord {
  count: number;
  lockedUntil?: number;
}

const attempts = new Map<string, AttemptRecord>();
const LOCK_MS = 15 * 60 * 1000;

function keyFor(employeeCode: string): string {
  return employeeCode.trim().toUpperCase();
}

export function isLoginLocked(employeeCode: string): boolean {
  const entry = attempts.get(keyFor(employeeCode));
  if (!entry?.lockedUntil) return false;
  if (Date.now() > entry.lockedUntil) {
    attempts.delete(keyFor(employeeCode));
    return false;
  }
  return true;
}

export function recordFailedLogin(employeeCode: string): { locked: boolean; remaining: number } {
  const key = keyFor(employeeCode);
  const limit = getLoginAttemptLimit();
  const entry = attempts.get(key) ?? { count: 0 };
  entry.count += 1;
  if (entry.count >= limit) {
    entry.lockedUntil = Date.now() + LOCK_MS;
  }
  attempts.set(key, entry);
  return { locked: entry.count >= limit, remaining: Math.max(0, limit - entry.count) };
}

export function clearLoginAttempts(employeeCode: string): void {
  attempts.delete(keyFor(employeeCode));
}
