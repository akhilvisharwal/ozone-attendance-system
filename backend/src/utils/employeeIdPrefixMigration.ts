import type { PoolClient } from "pg";
import { pool } from "../config/db";
import { storage } from "../services/storage";
import { parseIdFormat } from "./employeeCode";
import { clearLoginAttempts } from "./loginAttempts";

export interface EmployeeCodeRename {
  id: string;
  oldCode: string;
  newCode: string;
  numericPart: string;
  /** True when the preferred numeric suffix was already taken under the new prefix. */
  remappedDueToConflict?: boolean;
}

export interface PrefixMigrationResult {
  previousPrefix: string;
  nextPrefix: string;
  renamedCount: number;
  remappedDueToConflictCount: number;
  renames: EmployeeCodeRename[];
}

export interface MigrateEmployeeIdPrefixOptions {
  /** Explicit previous format — do not rely on the in-memory cache. */
  previousIdFormat: string;
  newIdFormat: string;
  /** When set, persist employee settings in the same DB transaction as the rename. */
  persistEmployeeSettings?: unknown;
  updatedBy?: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Extract trailing digits from an employee code (e.g. OZN001 → "001"). */
export function extractNumericSuffix(code: string): string | null {
  const match = code.trim().match(/(\d+)$/);
  return match?.[1] ?? null;
}

/**
 * Numeric part after a known prefix. Prefer this when the prefix itself may
 * contain digits (e.g. PA019001 with prefix PA019 → "001", not "019001").
 */
export function extractNumericAfterPrefix(code: string, prefix: string): string | null {
  const trimmed = code.trim();
  const escaped = escapeRegExp(prefix);
  const match = trimmed.match(new RegExp(`^${escaped}(\\d+)$`, "i"));
  return match?.[1] ?? null;
}

/**
 * Build the new employee code for a given old code under the new prefix.
 * Preserves the numeric suffix digits as-is (OZN001 → EMP001).
 * Pads only when the suffix is shorter than the configured pad length.
 */
export function buildMigratedEmployeeCode(
  oldCode: string,
  newPrefix: string,
  padLength: number,
  previousPrefix?: string
): string | null {
  const numeric = previousPrefix
    ? extractNumericAfterPrefix(oldCode, previousPrefix)
    : extractNumericSuffix(oldCode);
  if (!numeric) return null;
  const padded =
    numeric.length >= padLength ? numeric : numeric.padStart(padLength, "0");
  return `${newPrefix}${padded}`;
}

/**
 * Prefer the original numeric suffix; if that code is taken, walk forward to the
 * next free number under the new prefix (still digit-only, pad preserved).
 */
export function allocateMigratedEmployeeCode(
  preferredNumeric: string,
  newPrefix: string,
  padLength: number,
  usedNewCodes: Set<string>
): { code: string; remappedDueToConflict: boolean } {
  let num = parseInt(preferredNumeric, 10);
  if (!Number.isFinite(num) || num < 0) {
    throw new Error(`Invalid numeric suffix "${preferredNumeric}"`);
  }

  const width = Math.max(padLength, preferredNumeric.length);
  let remappedDueToConflict = false;

  for (let attempt = 0; attempt < 100_000; attempt++) {
    const padded = String(num).padStart(width, "0");
    const candidate = `${newPrefix}${padded}`;
    if (candidate.length > 20) {
      throw new Error(
        `New employee ID "${candidate}" exceeds the 20-character limit. Choose a shorter prefix.`
      );
    }
    const key = candidate.toUpperCase();
    if (!usedNewCodes.has(key)) {
      usedNewCodes.add(key);
      return { code: candidate, remappedDueToConflict };
    }
    remappedDueToConflict = true;
    num += 1;
  }

  throw new Error("Could not allocate a free employee ID under the new prefix.");
}

function rewritePath(pathValue: string | null | undefined, renames: Map<string, string>): string | null {
  if (!pathValue) return null;
  let next = pathValue;
  for (const [oldCode, newCode] of renames) {
    next = next
      .split(`avatars/${oldCode}/`)
      .join(`avatars/${newCode}/`)
      .split(`selfies/${oldCode}/`)
      .join(`selfies/${newCode}/`)
      .split(`site-photos/${oldCode}/`)
      .join(`site-photos/${newCode}/`);
  }
  return next;
}

async function renameStorageFolders(renames: EmployeeCodeRename[]): Promise<void> {
  if (!storage.renameDirectory) return;

  const folders = ["avatars", "selfies", "site-photos"] as const;
  for (const rename of renames) {
    if (rename.oldCode === rename.newCode) continue;
    for (const folder of folders) {
      try {
        await storage.renameDirectory(
          `${folder}/${rename.oldCode}`,
          `${folder}/${rename.newCode}`
        );
      } catch (err) {
        console.error(
          `[employee-id] Failed to rename ${folder}/${rename.oldCode} → ${folder}/${rename.newCode}:`,
          err
        );
      }
    }
  }
}

async function persistEmployeeSettingsInTx(
  client: PoolClient,
  value: unknown,
  updatedBy: string | undefined
): Promise<void> {
  await client.query(
    `INSERT INTO app_settings (category, value, updated_by)
     VALUES ('employee', $1::jsonb, $2)
     ON CONFLICT (category) DO UPDATE
       SET value = EXCLUDED.value,
           updated_by = EXCLUDED.updated_by,
           updated_at = now()`,
    [JSON.stringify(value), updatedBy ?? null]
  );
}

/**
 * Rewrite every employee_code that uses the previous prefix to the new prefix,
 * keeping each numeric suffix when possible. Conflicting targets get the next
 * free number under the new prefix.
 *
 * Relational tables (attendance, leave, tasks, etc.) reference employees by UUID,
 * so they remain valid automatically.
 */
export async function migrateEmployeeIdPrefix(
  newIdFormatOrOptions: string | MigrateEmployeeIdPrefixOptions
): Promise<PrefixMigrationResult | null> {
  let options: MigrateEmployeeIdPrefixOptions;
  if (typeof newIdFormatOrOptions === "string") {
    // Legacy single-arg callers: derive previous prefix from the settings cache.
    const current = parseIdFormat();
    options = {
      previousIdFormat: `${current.prefix}${"#".repeat(current.padLength)}`,
      newIdFormat: newIdFormatOrOptions,
    };
  } else {
    options = newIdFormatOrOptions;
  }

  const previous = parseIdFormat(options.previousIdFormat);
  const next = parseIdFormat(options.newIdFormat);
  const previousPrefix = previous.prefix;
  const nextPrefix = next.prefix;
  const padLength = next.padLength;

  if (previousPrefix === nextPrefix) {
    // Prefix unchanged — caller persists settings via updateCategory.
    return null;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const rows = await client.query<{ id: string; employee_code: string }>(
      `SELECT id, employee_code
         FROM employees
        WHERE deleted_at IS NULL
        ORDER BY employee_code ASC
        FOR UPDATE`
    );

    const planned: EmployeeCodeRename[] = [];
    const usedNewCodes = new Set<string>();
    const previousPrefixPattern = new RegExp(
      `^${escapeRegExp(previousPrefix)}(\\d+)$`,
      "i"
    );
    const nextPrefixPattern = new RegExp(`^${escapeRegExp(nextPrefix)}(\\d+)$`, "i");

    // Reserve codes that already use the new prefix (unchanged rows).
    for (const row of rows.rows) {
      if (nextPrefixPattern.test(row.employee_code)) {
        usedNewCodes.add(row.employee_code.toUpperCase());
      }
    }

    // Stable order by numeric suffix so conflict remapping is deterministic.
    const candidates = rows.rows
      .filter((row) => previousPrefixPattern.test(row.employee_code))
      .sort((a, b) => {
        const na = parseInt(extractNumericAfterPrefix(a.employee_code, previousPrefix) ?? "0", 10);
        const nb = parseInt(extractNumericAfterPrefix(b.employee_code, previousPrefix) ?? "0", 10);
        return na - nb;
      });

    for (const row of candidates) {
      const preferredNumeric = extractNumericAfterPrefix(row.employee_code, previousPrefix);
      if (!preferredNumeric) {
        throw new Error(
          `Cannot migrate employee ID "${row.employee_code}" — it has no numeric suffix to preserve.`
        );
      }

      const { code: newCode, remappedDueToConflict } = allocateMigratedEmployeeCode(
        preferredNumeric,
        nextPrefix,
        padLength,
        usedNewCodes
      );

      if (newCode !== row.employee_code) {
        planned.push({
          id: row.id,
          oldCode: row.employee_code,
          newCode,
          numericPart: preferredNumeric,
          remappedDueToConflict,
        });
      }
    }

    if (planned.length > 0) {
      // Phase 1: move to unique temporary codes to avoid UNIQUE collisions mid-swap.
      let tempIndex = 0;
      for (const rename of planned) {
        tempIndex += 1;
        const tempCode = `T${tempIndex.toString(36)}${rename.id.replace(/-/g, "").slice(0, 10)}`.slice(
          0,
          20
        );
        await client.query(
          `UPDATE employees SET employee_code = $1, updated_at = now() WHERE id = $2`,
          [tempCode, rename.id]
        );
      }

      // Phase 2: assign final codes.
      for (const rename of planned) {
        await client.query(
          `UPDATE employees SET employee_code = $1, updated_at = now() WHERE id = $2`,
          [rename.newCode, rename.id]
        );
      }

      const renameMap = new Map(planned.map((r) => [r.oldCode, r.newCode]));

      // Update path columns that embed employee codes in folder segments.
      const avatarRows = await client.query<{ id: string; profile_photo_path: string | null }>(
        `SELECT id, profile_photo_path FROM employees WHERE profile_photo_path IS NOT NULL`
      );
      for (const row of avatarRows.rows) {
        const nextPath = rewritePath(row.profile_photo_path, renameMap);
        if (nextPath && nextPath !== row.profile_photo_path) {
          await client.query(`UPDATE employees SET profile_photo_path = $1 WHERE id = $2`, [
            nextPath,
            row.id,
          ]);
        }
      }

      const attendanceRows = await client.query<{
        id: string;
        check_in_selfie_path: string | null;
        site_photo_paths: unknown;
      }>(
        `SELECT id, check_in_selfie_path, site_photo_paths
           FROM attendance
          WHERE check_in_selfie_path IS NOT NULL
             OR (site_photo_paths IS NOT NULL AND site_photo_paths::text <> '[]')`
      );

      for (const row of attendanceRows.rows) {
        const nextSelfie = rewritePath(row.check_in_selfie_path, renameMap);
        let nextPhotos = row.site_photo_paths;
        if (Array.isArray(row.site_photo_paths)) {
          nextPhotos = row.site_photo_paths.map((p) =>
            typeof p === "string" ? rewritePath(p, renameMap) ?? p : p
          );
        }

        const selfieChanged = nextSelfie !== row.check_in_selfie_path;
        const photosChanged = JSON.stringify(nextPhotos) !== JSON.stringify(row.site_photo_paths);
        if (selfieChanged || photosChanged) {
          await client.query(
            `UPDATE attendance
                SET check_in_selfie_path = $1,
                    site_photo_paths = $2::jsonb
              WHERE id = $3`,
            [nextSelfie, JSON.stringify(nextPhotos ?? []), row.id]
          );
        }
      }
    }

    if (options.persistEmployeeSettings) {
      await persistEmployeeSettingsInTx(
        client,
        options.persistEmployeeSettings,
        options.updatedBy
      );
    }

    await client.query("COMMIT");

    if (planned.length > 0) {
      await renameStorageFolders(planned);
      for (const rename of planned) {
        clearLoginAttempts(rename.oldCode);
        clearLoginAttempts(rename.newCode);
      }
    }

    return {
      previousPrefix,
      nextPrefix,
      renamedCount: planned.length,
      remappedDueToConflictCount: planned.filter((r) => r.remappedDueToConflict).length,
      renames: planned,
    };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    throw err;
  } finally {
    client.release();
  }
}

export function prefixesDiffer(previousIdFormat: string, nextIdFormat: string): boolean {
  return parseIdFormat(previousIdFormat).prefix !== parseIdFormat(nextIdFormat).prefix;
}
