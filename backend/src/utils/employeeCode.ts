import { pool } from "../config/db";
import { getSettings } from "../modules/settings/settings.cache";

export interface IdFormatParts {
  prefix: string;
  padLength: number;
}

/** Parses e.g. "OZN###" → { prefix: "OZN", padLength: 3 } */
export function parseIdFormat(format?: string): IdFormatParts {
  const raw = format ?? getSettings().employee.idFormat;
  const match = raw.match(/^([A-Za-z0-9]+)(#+)$/);
  if (!match) {
    return { prefix: "OZN", padLength: 3 };
  }
  return { prefix: match[1].toUpperCase(), padLength: match[2].length };
}

export async function generateNextEmployeeCode(): Promise<string> {
  const { prefix, padLength } = parseIdFormat();
  const result = await pool.query<{ employee_code: string }>(
    `SELECT employee_code FROM employees WHERE employee_code LIKE $1 ORDER BY employee_code DESC`,
    [`${prefix}%`]
  );

  let maxNumber = 0;
  for (const row of result.rows) {
    const match = row.employee_code.match(new RegExp(`^${prefix}(\\d+)$`));
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNumber) maxNumber = num;
    }
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
