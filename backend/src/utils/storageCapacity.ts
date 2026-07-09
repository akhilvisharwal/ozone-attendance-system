import { formatDatabaseSize } from "./backupHelpers";

export type StorageLimitSource = "plan" | "manual" | "env" | "default";

export type StorageWarningLevel = "none" | "warning" | "high" | "critical";

export const DEFAULT_DATABASE_CAPACITY_BYTES = 1024 ** 3; // 1 GB

export interface StorageCapacity {
  usedBytes: number;
  usedLabel: string;
  maxBytes: number;
  maxLabel: string;
  remainingBytes: number;
  remainingLabel: string;
  percentUsed: number;
  limitSource: StorageLimitSource;
  limitDescription: string;
  capacityGb: number;
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
      `Critical: database storage usage is at ${percent}%. Cleanup or increase the configured capacity immediately.`
    );
  }
  return messages;
}

/**
 * Resolve database plan capacity.
 * Priority: admin-configured GB → DATABASE_STORAGE_LIMIT env → default 1 GB.
 * Never uses local OS disk space.
 */
export function resolveDatabaseCapacityBytes(input: {
  configuredCapacityGb?: number | null;
  envLimit?: string | null;
}): { maxBytes: number; capacityGb: number; limitSource: StorageLimitSource; limitDescription: string } {
  const configuredGb =
    typeof input.configuredCapacityGb === "number" &&
    Number.isFinite(input.configuredCapacityGb) &&
    input.configuredCapacityGb > 0
      ? input.configuredCapacityGb
      : null;

  if (configuredGb != null) {
    return {
      maxBytes: gbToBytes(configuredGb),
      capacityGb: configuredGb,
      limitSource: "manual",
      limitDescription:
        "Maximum storage is the database plan capacity configured by an administrator (default 1 GB for Render starter plans).",
    };
  }

  const envBytes = parseStorageLimitBytes(input.envLimit ?? undefined);
  if (envBytes != null) {
    return {
      maxBytes: envBytes,
      capacityGb: bytesToGb(envBytes),
      limitSource: "env",
      limitDescription:
        "Maximum storage is taken from the DATABASE_STORAGE_LIMIT environment variable.",
    };
  }

  return {
    maxBytes: DEFAULT_DATABASE_CAPACITY_BYTES,
    capacityGb: 1,
    limitSource: "default",
    limitDescription:
      "Maximum storage defaults to 1 GB (typical Render PostgreSQL starter plan). Configure the plan capacity below if your plan differs.",
  };
}

export function buildStorageCapacity(input: {
  /** Must be PostgreSQL database size only. */
  usedBytes: number;
  configuredCapacityGb?: number | null;
  envLimit?: string | null;
}): StorageCapacity {
  const usedBytes = Math.max(0, input.usedBytes);
  const resolved = resolveDatabaseCapacityBytes({
    configuredCapacityGb: input.configuredCapacityGb,
    envLimit: input.envLimit,
  });
  const remainingBytes = Math.max(0, resolved.maxBytes - usedBytes);
  const percentUsed =
    resolved.maxBytes > 0
      ? Math.min(100, Math.round((usedBytes / resolved.maxBytes) * 1000) / 10)
      : 0;
  const level = warningLevelForPercent(percentUsed);

  return {
    usedBytes,
    usedLabel: formatDatabaseSize(usedBytes),
    maxBytes: resolved.maxBytes,
    maxLabel: formatDatabaseSize(resolved.maxBytes),
    remainingBytes,
    remainingLabel: formatDatabaseSize(remainingBytes),
    percentUsed,
    limitSource: resolved.limitSource,
    limitDescription: resolved.limitDescription,
    capacityGb: resolved.capacityGb,
    warningLevel: level,
    warnings: warningsForPercent(percentUsed),
  };
}

/** @deprecated Use parseStorageLimitBytes */
export function resolvePlanLimitBytes(envValue: string | undefined): number | null {
  return parseStorageLimitBytes(envValue);
}
