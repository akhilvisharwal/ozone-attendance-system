export const INACTIVITY_WARNING_MINUTES = 2;

export function getInactivityTimeoutMs(timeoutMinutes: number): number {
  return Math.max(1, timeoutMinutes) * 60_000;
}

export function getWarningLeadMs(timeoutMinutes: number): number {
  const warningMs = INACTIVITY_WARNING_MINUTES * 60_000;
  const timeoutMs = getInactivityTimeoutMs(timeoutMinutes);
  return Math.min(warningMs, Math.max(0, timeoutMs - 60_000));
}

export function msUntilInactivityWarning(timeoutMinutes: number, lastActivityMs: number, nowMs = Date.now()): number {
  const timeoutMs = getInactivityTimeoutMs(timeoutMinutes);
  const warningLeadMs = getWarningLeadMs(timeoutMinutes);
  const warningAtMs = lastActivityMs + timeoutMs - warningLeadMs;
  return Math.max(0, warningAtMs - nowMs);
}

export function msUntilInactivityLogout(timeoutMinutes: number, lastActivityMs: number, nowMs = Date.now()): number {
  const timeoutMs = getInactivityTimeoutMs(timeoutMinutes);
  return Math.max(0, lastActivityMs + timeoutMs - nowMs);
}

export function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
