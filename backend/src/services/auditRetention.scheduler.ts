import { pool } from "../config/db";
import { getSettings } from "../modules/settings/settings.cache";
import { deleteAuditLogsOlderThan } from "../modules/audit/audit.repository";

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours
let lastPurgeDate: string | null = null;

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

async function runRetentionPurgeIfDue(): Promise<void> {
  const today = todayKey();
  if (lastPurgeDate === today) return;

  const retentionDays = getSettings().audit?.retentionDays ?? 90;
  const deleted = await deleteAuditLogsOlderThan(retentionDays);
  lastPurgeDate = today;
  if (deleted > 0) {
    console.log(
      `[audit] Retention purge removed ${deleted} log(s) older than ${retentionDays} days.`
    );
  }
}

async function tick(): Promise<void> {
  try {
    await pool.query("SELECT 1");
    await runRetentionPurgeIfDue();
  } catch (err) {
    console.error("[audit] Retention scheduler tick failed:", err);
  }
}

export function startAuditRetentionScheduler(): void {
  void tick();
  setInterval(tick, CHECK_INTERVAL_MS);
  console.log("[audit] Retention scheduler started (checks every 6 hours).");
}
