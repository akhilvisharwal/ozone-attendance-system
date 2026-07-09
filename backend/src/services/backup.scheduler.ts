import { pool } from "../config/db";
import { getSettings, updateCategory } from "../modules/settings/settings.cache";
import * as backupService from "../modules/settings/settings.backup";

const CHECK_INTERVAL_MS = 60 * 60 * 1000;

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

async function runScheduledBackupIfDue(): Promise<void> {
  const backupSettings = getSettings().backup;
  if (!backupSettings.automaticDailyBackup) return;

  const lastRunDate = backupSettings.lastBackupAt?.slice(0, 10) ?? null;
  const today = todayKey();
  if (lastRunDate === today) return;

  const adminRow = await pool.query<{ id: string }>(
    `SELECT id FROM employees
      WHERE role = 'admin' AND is_active = true AND deleted_at IS NULL
      ORDER BY created_at ASC
      LIMIT 1`
  );
  const adminId = adminRow.rows[0]?.id;
  if (!adminId) {
    console.warn("[backup] Skipping automatic backup — no active admin found.");
    return;
  }

  const { filename } = await backupService.createBackupFile("full");
  const lastBackupAt = new Date().toISOString();
  await updateCategory(
    "backup",
    { ...backupSettings, lastBackupAt },
    adminId
  );
  console.log(`[backup] Automatic daily backup completed: ${filename}`);
}

async function tick(): Promise<void> {
  try {
    await pool.query("SELECT 1");
    await runScheduledBackupIfDue();
  } catch (err) {
    console.error("[backup] Scheduler tick failed:", err);
  }
}

export function startDailyBackupScheduler(): void {
  void tick();
  setInterval(tick, CHECK_INTERVAL_MS);
  console.log("[backup] Daily backup scheduler started (checks hourly).");
}
