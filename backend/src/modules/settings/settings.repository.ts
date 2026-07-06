import { pool } from "../../config/db";
import {
  AppSettings,
  SETTINGS_CATEGORIES,
  SettingsCategory,
  buildDefaultSettings,
} from "./settings.types";

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

export async function exportAllData(): Promise<Record<string, unknown>> {
  const tables = [
    "employees",
    "sites",
    "attendance_records",
    "leave_requests",
    "company_holidays",
    "tasks",
    "app_settings",
    "audit_logs",
  ];
  const out: Record<string, unknown> = {};
  for (const table of tables) {
    const res = await pool.query(`SELECT * FROM ${table}`);
    out[table] = res.rows;
  }
  return out;
}
