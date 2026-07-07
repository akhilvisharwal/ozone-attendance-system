import { pool } from "../config/db";
import {
  AUTO_ABSENCE_CUTOFF,
  isPastAutoAbsenceCutoff,
  runAutoAbsenceMarking,
} from "./autoAbsence.service";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function msUntilNextCutoff(now: Date = new Date()): number {
  const next = new Date(now);
  next.setHours(AUTO_ABSENCE_CUTOFF.hour, AUTO_ABSENCE_CUTOFF.minute, 0, 0);
  if (now.getTime() >= next.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime() - now.getTime();
}

function formatCutoffTime(): string {
  const { hour, minute } = AUTO_ABSENCE_CUTOFF;
  const h12 = hour % 12 || 12;
  const ampm = hour >= 12 ? "PM" : "AM";
  return `${h12}:${String(minute).padStart(2, "0")} ${ampm}`;
}

async function tick(): Promise<void> {
  try {
    await pool.query("SELECT 1");
    await runAutoAbsenceMarking();
  } catch (err) {
    console.error("[auto-absence] failed:", err);
  }
}

export function startAutoAbsenceScheduler(): void {
  const scheduleNext = () => {
    const delay = msUntilNextCutoff();
    setTimeout(async () => {
      await tick();
      setInterval(tick, MS_PER_DAY);
    }, delay);
  };

  if (isPastAutoAbsenceCutoff()) {
    void tick();
  }

  scheduleNext();
  console.log(`Auto absence scheduler started (daily at ${formatCutoffTime()} server time).`);
}
