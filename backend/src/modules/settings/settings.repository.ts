import { pool } from "../../config/db";
import {
  AppSettings,
  SETTINGS_CATEGORIES,
  SettingsCategory,
  buildDefaultSettings,
} from "./settings.types";
import { normalizeLeaveSettings } from "../../utils/leaveSettings";
import { normalizeAttendanceSettings, normalizeCompanySettings, normalizeEmployeeSettings, normalizeSecuritySettings } from "../../utils/settingsHelpers";
import { normalizeMobileSettings } from "../../utils/attendanceCapture";
import { normalizeBackupSettings } from "../../utils/backupHelpers";
import { normalizeExpenseSettings } from "../expenses/expenseSettings";

function deepMerge<T extends Record<string, unknown>>(base: T, patch: Partial<T>): T {
  const out = { ...base };
  for (const key of Object.keys(patch) as (keyof T)[]) {
    const val = patch[key];
    if (val !== undefined) out[key] = val as T[keyof T];
  }
  return out;
}

export async function seedSettingsIfEmpty(): Promise<void> {
  const defaults = buildDefaultSettings();
  for (const category of SETTINGS_CATEGORIES) {
    await pool.query(
      `INSERT INTO app_settings (category, value)
       VALUES ($1, $2)
       ON CONFLICT (category) DO NOTHING`,
      [category, JSON.stringify(defaults[category])]
    );
  }
}

export async function fetchAllSettingsRows(): Promise<Partial<Record<SettingsCategory, unknown>>> {
  const result = await pool.query<{ category: SettingsCategory; value: unknown }>(
    `SELECT category, value FROM app_settings`
  );
  const map: Partial<Record<SettingsCategory, unknown>> = {};
  for (const row of result.rows) {
    map[row.category] = row.value;
  }
  return map;
}

export async function getMergedSettings(): Promise<AppSettings> {
  const defaults = buildDefaultSettings();
  const rows = await fetchAllSettingsRows();
  const out: Record<string, unknown> = { ...defaults };
  for (const category of SETTINGS_CATEGORIES) {
    const row = rows[category];
    if (row && typeof row === "object" && !Array.isArray(row)) {
      out[category] = deepMerge(
        defaults[category] as unknown as Record<string, unknown>,
        row as Record<string, unknown>
      );
    }
  }
  out.leave = normalizeLeaveSettings(out.leave);
  out.company = normalizeCompanySettings(out.company as AppSettings["company"]);
  out.attendance = normalizeAttendanceSettings(out.attendance as AppSettings["attendance"]);
  out.employee = normalizeEmployeeSettings(out.employee as AppSettings["employee"]);
  out.mobile = normalizeMobileSettings(out.mobile as AppSettings["mobile"]);
  out.security = normalizeSecuritySettings(out.security as AppSettings["security"]);
  out.backup = normalizeBackupSettings(out.backup as AppSettings["backup"]);
  out.expenses = normalizeExpenseSettings(out.expenses);
  return out as unknown as AppSettings;
}

export async function updateSettingsCategory<C extends SettingsCategory>(
  category: C,
  value: AppSettings[C],
  updatedBy: string
): Promise<AppSettings[C]> {
  const result = await pool.query<{ value: AppSettings[C] }>(
    `INSERT INTO app_settings (category, value, updated_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (category) DO UPDATE
       SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()
     RETURNING value`,
    [category, JSON.stringify(value), updatedBy]
  );
  return result.rows[0].value;
}
