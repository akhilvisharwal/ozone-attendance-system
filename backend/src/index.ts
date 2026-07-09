import { createApp } from "./app";
import { env } from "./config/env";
import { APP_TITLE } from "./config/branding";
import { pool } from "./config/db";
import { runMigrations } from "./db/migrate";
import { initSettingsCache } from "./modules/settings/settings.cache";
import { startAutoAbsenceScheduler } from "./services/autoAbsence.scheduler";
import { startTaskReminderScheduler } from "./services/taskReminders.service";
import { startDailyBackupScheduler } from "./services/backup.scheduler";
import { startAuditRetentionScheduler } from "./services/auditRetention.scheduler";

async function main() {
  if (env.isProduction) {
    console.log("Running database migrations...");
    await runMigrations();
  }

  await pool.query("SELECT 1");
  console.log("Database connection established.");

  await initSettingsCache();
  console.log("Application settings loaded.");

  startTaskReminderScheduler();
  console.log("Task reminder scheduler started.");

  startAutoAbsenceScheduler();
  startDailyBackupScheduler();
  startAuditRetentionScheduler();

  const app = createApp();
  app.listen(env.port, () => {
    console.log(`${APP_TITLE} API listening on port ${env.port} (${env.nodeEnv})`);
  });
}
main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
