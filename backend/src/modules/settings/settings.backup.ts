import fs from "fs";
import path from "path";
import type { PoolClient } from "pg";
import { env } from "../../config/env";
import { pool } from "../../config/db";
import {
  buildBackupPayload,
  formatDatabaseSize,
  FULL_BACKUP_TABLES,
  parseBackupPayload,
  RESTORE_TRUNCATE_TABLES,
  type BackupExportType,
  type BackupPayload,
} from "../../utils/backupHelpers";

export interface DatabaseStatus {
  health: "healthy" | "unhealthy";
  databaseSizeBytes: number;
  databaseSizeLabel: string;
  totalEmployees: number;
  totalAttendanceRecords: number;
}

/** Keep backups under UPLOAD_DIR so Render persistent disk covers them. */
const BACKUP_DIR = path.join(env.uploadDir, "backups");

function ensureBackupDir(): void {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

async function queryTableRows(table: string): Promise<unknown[]> {
  const res = await pool.query(`SELECT * FROM ${table}`);
  return res.rows;
}

export async function getDatabaseStatus(): Promise<DatabaseStatus> {
  let health: DatabaseStatus["health"] = "healthy";
  try {
    await pool.query("SELECT 1");
  } catch {
    health = "unhealthy";
  }

  const [sizeRes, employeesRes, attendanceRes] = await Promise.all([
    pool.query<{ bytes: string }>(
      `SELECT pg_database_size(current_database())::text AS bytes`
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM employees WHERE deleted_at IS NULL`
    ),
    pool.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM attendance`),
  ]);

  const databaseSizeBytes = parseInt(sizeRes.rows[0]?.bytes ?? "0", 10);

  return {
    health,
    databaseSizeBytes,
    databaseSizeLabel: formatDatabaseSize(databaseSizeBytes),
    totalEmployees: parseInt(employeesRes.rows[0]?.count ?? "0", 10),
    totalAttendanceRecords: parseInt(attendanceRes.rows[0]?.count ?? "0", 10),
  };
}

export async function exportTables(type: BackupExportType): Promise<BackupPayload> {
  const tables: Record<string, unknown[]> = {};

  if (type === "employees") {
    const res = await pool.query(
      `SELECT * FROM employees WHERE deleted_at IS NULL ORDER BY created_at ASC`
    );
    tables.employees = res.rows;
  } else if (type === "attendance") {
    const res = await pool.query(
      `SELECT a.*, e.employee_code, e.name AS employee_name
         FROM attendance a
         JOIN employees e ON e.id = a.employee_id
         ORDER BY a.attendance_date DESC, a.created_at DESC`
    );
    tables.attendance = res.rows;
  } else {
    for (const table of FULL_BACKUP_TABLES) {
      tables[table] = await queryTableRows(table);
    }
  }

  return buildBackupPayload(type, tables);
}

export async function createBackupFile(type: BackupExportType = "full"): Promise<{
  payload: BackupPayload;
  filename: string;
  filePath: string;
}> {
  ensureBackupDir();
  const payload = await exportTables(type);
  const stamp = payload.manifest.exportedAt.replace(/[:.]/g, "-");
  const filename = `ozone-backup-${type}-${stamp}.json`;
  const filePath = path.join(BACKUP_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
  return { payload, filename, filePath };
}

async function insertRows(client: PoolClient, table: string, rows: unknown[]): Promise<void> {
  if (!rows.length) return;
  const first = rows[0] as Record<string, unknown>;
  const columns = Object.keys(first);
  if (!columns.length) return;

  const colList = columns.map((c) => `"${c}"`).join(", ");
  const batchSize = 100;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const values: unknown[] = [];
    const tuples = batch
      .map((row, rowIdx) => {
        const record = row as Record<string, unknown>;
        const placeholders = columns.map((col, colIdx) => {
          values.push(record[col] ?? null);
          return `$${rowIdx * columns.length + colIdx + 1}`;
        });
        return `(${placeholders.join(", ")})`;
      })
      .join(", ");
    await client.query(
      `INSERT INTO ${table} (${colList}) VALUES ${tuples}`,
      values
    );
  }
}

export async function restoreFromBackupPayload(payload: BackupPayload): Promise<{
  restoredTables: string[];
  rowCounts: Record<string, number>;
}> {
  const parsed = parseBackupPayload(payload);
  const client = await pool.connect();
  const rowCounts: Record<string, number> = {};

  try {
    await client.query("BEGIN");
    await client.query("SET session_replication_role = replica");

    const truncateList = RESTORE_TRUNCATE_TABLES.join(", ");
    await client.query(`TRUNCATE TABLE ${truncateList} RESTART IDENTITY CASCADE`);

    for (const table of FULL_BACKUP_TABLES) {
      let rows = parsed.tables[table] ?? [];
      if (table === "employees") {
        rows = [...rows].sort((a, b) => {
          const aCreated = (a as Record<string, unknown>).created_by;
          const bCreated = (b as Record<string, unknown>).created_by;
          if (aCreated == null && bCreated != null) return -1;
          if (aCreated != null && bCreated == null) return 1;
          return 0;
        });
      }
      if (table === "attendance") {
        rows = rows.map((row) => {
          const copy = { ...(row as Record<string, unknown>) };
          delete copy.employee_code;
          delete copy.employee_name;
          return copy;
        });
      }
      await insertRows(client, table, rows);
      rowCounts[table] = rows.length;
    }

    await client.query("SET session_replication_role = DEFAULT");
    await client.query("COMMIT");

    return {
      restoredTables: FULL_BACKUP_TABLES.filter((t) => (parsed.tables[t] ?? []).length > 0),
      rowCounts,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export function serializeBackupPayload(payload: BackupPayload): string {
  return JSON.stringify(payload, null, 2);
}

/** @deprecated Use exportTables('full') via settings.backup */
export async function exportAllDataLegacy(): Promise<Record<string, unknown>> {
  const payload = await exportTables("full");
  return payload.tables;
}
