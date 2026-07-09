import { formatDatabaseSize } from "./backupHelpers";

/**
 * Where the maximum storage capacity value came from.
 * - "provider": detected automatically from the hosting provider API (e.g. Render).
 * - "env":      taken from the DATABASE_STORAGE_LIMIT environment variable.
 * - "unavailable": could not be determined automatically (no estimate is shown).
 */
export type StorageLimitSource = "provider" | "env" | "unavailable";

export type StorageWarningLevel = "none" | "warning" | "high" | "critical";

export interface ResolvedCapacity {
  /** Maximum storage in bytes, or null when it cannot be determined automatically. */
  maxBytes: number | null;
  limitSource: StorageLimitSource;
  limitDescription: string;
}

export interface StorageCapacity {
  usedBytes: number;
  usedLabel: string;
  /** Null when capacity cannot be determined automatically. */
  maxBytes: number | null;
  maxLabel: string;
  /** Null when capacity cannot be determined automatically. */
  remainingBytes: number | null;
  remainingLabel: string;
  /** Null when capacity cannot be determined automatically. */
  percentUsed: number | null;
  limitSource: StorageLimitSource;
  limitDescription: string;
  /** Null when capacity cannot be determined automatically. */
  capacityGb: number | null;
  /** True when the plan capacity was detected automatically (provider or env). */
  detected: boolean;
  warningLevel: StorageWarningLevel;
  warnings: string[];
}

export function parseStorageLimitBytes(raw: string | undefined | null): number | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim().toLowerCase();
  const match = /^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb|tb)?$/.exec(trimmed);
  if (!match) {
    const asInt = parseInt(trimmed, 10);
    return Number.isFinite(asInt) && asInt > 0 ? asInt : null;
  }
  const amount = parseFloat(match[1]);
  const unit = match[2] ?? "b";
  const multipliers: Record<string, number> = {
    b: 1,
    kb: 1024,
    mb: 1024 ** 2,
    gb: 1024 ** 3,
    tb: 1024 ** 4,
  };
  const bytes = Math.round(amount * (multipliers[unit] ?? 1));
  return bytes > 0 ? bytes : null;
}

export function gbToBytes(gb: number): number {
  return Math.round(gb * 1024 ** 3);
}

export function bytesToGb(bytes: number): number {
  return Math.round((bytes / 1024 ** 3) * 1000) / 1000;
}

function warningLevelForPercent(percent: number): StorageWarningLevel {
  if (percent >= 95) return "critical";
  if (percent >= 85) return "high";
  if (percent >= 70) return "warning";
  return "none";
}

function warningsForPercent(percent: number): string[] {
  const messages: string[] = [];
  if (percent >= 70) {
    messages.push(
      `Database storage usage is at ${percent}%. Consider exporting a backup and reviewing cleanup options.`
    );
  }
  if (percent >= 85) {
    messages.push(
      `Database storage usage is high (${percent}%). Free space soon to avoid plan limits.`
    );
  }
  if (percent >= 95) {
    messages.push(
      `Critical: database storage usage is at ${percent}%. Clean up disposable data immediately.`
    );
  }
  return messages;
}

/**
 * Build the storage capacity view model from the live PostgreSQL database size and
 * a capacity that was resolved automatically (provider API or environment variable).
 *
 * When the maximum capacity is unknown, all capacity-derived values are reported as
 * unavailable rather than estimated, so the UI never shows misleading numbers.
 */
export function buildStorageCapacity(input: {
  /** Must be the PostgreSQL database size only (pg_database_size). */
  usedBytes: number;
  resolved: ResolvedCapacity;
}): StorageCapacity {
  const usedBytes = Math.max(0, input.usedBytes);
  const usedLabel = formatDatabaseSize(usedBytes);
  const { maxBytes, limitSource, limitDescription } = input.resolved;

  if (maxBytes == null || maxBytes <= 0) {
    return {
      usedBytes,
      usedLabel,
      maxBytes: null,
      maxLabel: "Not available",
      remainingBytes: null,
      remainingLabel: "Not available",
      percentUsed: null,
      limitSource: "unavailable",
      limitDescription,
      capacityGb: null,
      detected: false,
      warningLevel: "none",
      warnings: [],
    };
  }

  const remainingBytes = Math.max(0, maxBytes - usedBytes);
  const percentUsed = Math.min(100, Math.round((usedBytes / maxBytes) * 1000) / 10);
  const level = warningLevelForPercent(percentUsed);

  return {
    usedBytes,
    usedLabel,
    maxBytes,
    maxLabel: formatDatabaseSize(maxBytes),
    remainingBytes,
    remainingLabel: formatDatabaseSize(remainingBytes),
    percentUsed,
    limitSource,
    limitDescription,
    capacityGb: bytesToGb(maxBytes),
    detected: true,
    warningLevel: level,
    warnings: warningsForPercent(percentUsed),
  };
}
