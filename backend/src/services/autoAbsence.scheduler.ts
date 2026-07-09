import { pool } from "../config/db";
import { runAutoAbsenceMarking } from "./autoAbsence.service";

/** Re-check throughout the evening so per-employee override closing times are honored. */
const POLL_INTERVAL_MS = 30 * 60 * 1000;

async function tick(): Promise<void> {
  try {
    await pool.query("SELECT 1");
    await runAutoAbsenceMarking();
  } catch (err) {
    console.error("[auto-absence] failed:", err);
  }
}

export function startAutoAbsenceScheduler(): void {
  void tick();
  setInterval(tick, POLL_INTERVAL_MS);
  console.log(
    `[auto-absence] Scheduler started (polls every ${POLL_INTERVAL_MS / 60_000} minutes; per-employee closing times from effective rules).`
  );
}
