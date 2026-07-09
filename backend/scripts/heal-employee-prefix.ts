/**
 * Heal desynced employee ID prefix: if most employee codes already use a
 * different prefix than app_settings.employee.idFormat, update settings to match.
 *
 * Run: npx tsx scripts/heal-employee-prefix.ts
 */
import { pool } from "../src/config/db";
import { initSettingsCache, getSettings, refreshSettingsCache } from "../src/modules/settings/settings.cache";
import { parseIdFormat } from "../src/utils/employeeCode";
import { normalizeEmployeeSettings } from "../src/utils/settingsHelpers";

async function main() {
  await initSettingsCache();
  const settings = getSettings().employee;
  const configured = parseIdFormat(settings.idFormat);

  const rows = await pool.query<{ employee_code: string }>(
    `SELECT employee_code FROM employees
      WHERE deleted_at IS NULL AND role = 'employee'
      ORDER BY employee_code`
  );

  const prefixCounts = new Map<string, number>();
  for (const row of rows.rows) {
    const match = row.employee_code.match(/^([A-Za-z0-9]+?)(\d+)$/);
    if (!match) continue;
    const prefix = match[1].toUpperCase();
    prefixCounts.set(prefix, (prefixCounts.get(prefix) ?? 0) + 1);
  }

  console.log("Configured prefix:", configured.prefix, `(${settings.idFormat})`);
  console.log("Observed prefixes among employees:", Object.fromEntries(prefixCounts));

  let dominant: string | null = null;
  let dominantCount = 0;
  for (const [prefix, count] of prefixCounts) {
    if (count > dominantCount) {
      dominant = prefix;
      dominantCount = count;
    }
  }

  if (!dominant || dominant === configured.prefix) {
    console.log("No heal needed — settings already match employee codes.");
    await pool.end();
    return;
  }

  const next = normalizeEmployeeSettings({
    ...settings,
    idFormat: `${dominant}${"#".repeat(configured.padLength)}`,
  });

  await pool.query(
    `INSERT INTO app_settings (category, value)
     VALUES ('employee', $1::jsonb)
     ON CONFLICT (category) DO UPDATE
       SET value = EXCLUDED.value, updated_at = now()`,
    [JSON.stringify(next)]
  );
  await refreshSettingsCache();

  console.log(`Healed settings idFormat: ${settings.idFormat} → ${next.idFormat}`);
  console.log("Cached now:", getSettings().employee.idFormat);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
