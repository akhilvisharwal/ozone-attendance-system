/** Pure helpers for inactivity-based session expiry (unit-tested). */

export function isInactiveSince(
  lastActivityAt: Date,
  now: Date,
  timeoutMinutes: number
): boolean {
  if (timeoutMinutes <= 0) return false;
  const idleMs = now.getTime() - lastActivityAt.getTime();
  return idleMs >= timeoutMinutes * 60_000;
}

export function msUntilInactivityExpiry(
  lastActivityAt: Date,
  now: Date,
  timeoutMinutes: number
): number {
  const expiryMs = lastActivityAt.getTime() + timeoutMinutes * 60_000;
  return Math.max(0, expiryMs - now.getTime());
}
