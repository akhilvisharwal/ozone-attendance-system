import { pool } from "../config/db";
import { getSettings } from "../modules/settings/settings.cache";
import { extractNumericAfterPrefix } from "./employeeIdPrefixMigration";

export interface IdFormatParts {
  prefix: string;
  padLength: number;
}

/** Parses e.g. "OZN###" → { prefix: "OZN", padLength: 3 } */
export function parseIdFormat(format?: string): IdFormatParts {
  const raw = (format ?? getSettings().employee.idFormat ?? "OZN###").trim();
  const match = raw.match(/^([A-Za-z0-9]+)(#+)$/);
  if (!match) {
    return { prefix: "OZN", padLength: 3 };
  }
  return { prefix: match[1].toUpperCase(), padLength: match[2].length };
}

/**
 * Next employee code for the configured ID prefix.
 * After a prefix migration (OZN→EMP), existing codes already use the new prefix,
 * so numbering continues from the highest numeric suffix (e.g. EMP003 → EMP004).
 */
export async function generateNextEmployeeCode(): Promise<string> {
  const { prefix, padLength } = parseIdFormat();
  const result = await pool.query<{ employee_code: string }>(
    `SELECT employee_code
       FROM employees
      WHERE employee_code ~ ('^' || $1 || '[0-9]+$')
      ORDER BY LENGTH(employee_code) DESC, employee_code DESC`,
    [prefix]
  );

  let maxNumber = 0;
  for (const row of result.rows) {
    const numeric = extractNumericAfterPrefix(row.employee_code, prefix);
    if (!numeric) continue;
    const num = parseInt(numeric, 10);
    if (Number.isFinite(num) && num > maxNumber) maxNumber = num;
  }

  const next = maxNumber + 1;
  return `${prefix}${String(next).padStart(padLength, "0")}`;
}

export function generateTemporaryPassword(): string {
  const configured = getSettings().employee.defaultPassword?.trim();
  if (configured) return configured;

  const s = getSettings().security;
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let pwd = "";
  const targetLen = Math.max(s.passwordMinLength, 10);
  for (let i = 0; i < targetLen - 2; i++) {
    pwd += chars[Math.floor(Math.random() * chars.length)];
  }
  if (s.requireUppercase && !/[A-Z]/.test(pwd)) pwd += "A";
  if (s.requireNumbers && !/[0-9]/.test(pwd)) pwd += "2";
  return `${pwd}!1`;
}
