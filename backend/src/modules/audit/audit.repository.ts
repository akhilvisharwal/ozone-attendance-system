import { Request } from "express";
import { pool } from "../../config/db";
import {
  actionsForActionType,
  actionsForModule,
  buildAuditDescription,
  resolveAuditMeta,
  type AuditActionType,
  type AuditModule,
} from "./audit.catalog";

export type AuditStatus = "success" | "failed";

export interface AuditLogRow {
  id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  status: AuditStatus;
  created_at: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_code: string | null;
  actor_role: string | null;
}

export interface AuditLogView extends AuditLogRow {
  module: AuditModule;
  action_type: AuditActionType;
  action_label: string;
  description: string;
}

export interface AuditListQuery {
  page: number;
  limit: number;
  search?: string;
  from?: string;
  to?: string;
  actorId?: string;
  module?: AuditModule;
  actionType?: AuditActionType;
  status?: AuditStatus;
  action?: string;
}

export interface LogAuditOptions {
  actorId?: string | null;
  status?: AuditStatus;
  userAgent?: string | null;
  ipAddress?: string | null;
}

function truncateUserAgent(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return value.trim().slice(0, 512);
}

function enrichRow(row: AuditLogRow): AuditLogView {
  const metadata =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? row.metadata
      : {};
  const meta = resolveAuditMeta(row.action, row.target_type);
  return {
    ...row,
    metadata,
    module: meta.module,
    action_type: meta.actionType,
    action_label: meta.label,
    description: buildAuditDescription(row.action, metadata, row.target_type),
  };
}

/**
 * Write an audit log. The 5th argument is always metadata (backward compatible).
 * Pass status/actor overrides via the optional 6th `options` argument.
 */
export async function logAudit(
  req: Request,
  action: string,
  targetType?: string,
  targetId?: string,
  metadata: Record<string, unknown> = {},
  options: LogAuditOptions = {}
): Promise<void> {
  const status: AuditStatus = options.status ?? "success";
  const actorId =
    options.actorId !== undefined ? options.actorId : (req.user?.id ?? null);
  const userAgent =
    options.userAgent !== undefined
      ? truncateUserAgent(options.userAgent)
      : truncateUserAgent(req.headers["user-agent"]);
  const ipAddress =
    options.ipAddress !== undefined ? options.ipAddress : (req.ip ?? null);

  try {
    await pool.query(
      `INSERT INTO audit_logs
         (actor_id, action, target_type, target_id, metadata, ip_address, user_agent, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        actorId,
        action,
        targetType ?? null,
        targetId ?? null,
        JSON.stringify(metadata ?? {}),
        ipAddress,
        userAgent,
        status,
      ]
    );
  } catch (err) {
    console.error("Failed to write audit log:", err);
  }
}

function buildWhere(query: AuditListQuery): { where: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (query.search?.trim()) {
    const term = `%${query.search.trim()}%`;
    conditions.push(
      `(a.action ILIKE $${idx} OR a.target_type ILIKE $${idx} OR a.ip_address ILIKE $${idx}
        OR a.user_agent ILIKE $${idx} OR a.metadata::text ILIKE $${idx}
        OR e.name ILIKE $${idx} OR e.employee_code ILIKE $${idx})`
    );
    params.push(term);
    idx++;
  }

  if (query.action?.trim()) {
    conditions.push(`a.action ILIKE $${idx++}`);
    params.push(`%${query.action.trim()}%`);
  }

  if (query.from) {
    conditions.push(`a.created_at >= $${idx++}::date`);
    params.push(query.from);
  }

  if (query.to) {
    conditions.push(`a.created_at < ($${idx++}::date + interval '1 day')`);
    params.push(query.to);
  }

  if (query.actorId) {
    conditions.push(`a.actor_id = $${idx++}::uuid`);
    params.push(query.actorId);
  }

  if (query.status) {
    conditions.push(`a.status = $${idx++}`);
    params.push(query.status);
  }

  if (query.module) {
    const actions = actionsForModule(query.module);
    if (actions.length > 0) {
      conditions.push(`a.action = ANY($${idx++}::text[])`);
      params.push(actions);
    } else {
      conditions.push("FALSE");
    }
  }

  if (query.actionType) {
    const actions = actionsForActionType(query.actionType);
    if (actions.length > 0) {
      conditions.push(`a.action = ANY($${idx++}::text[])`);
      params.push(actions);
    } else {
      conditions.push("FALSE");
    }
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return { where, params };
}

const SELECT_COLS = `
  a.id, a.action, a.target_type, a.target_id, a.metadata, a.ip_address,
  a.user_agent, a.status, a.created_at, a.actor_id,
  e.name AS actor_name, e.employee_code AS actor_code, e.role AS actor_role
`;

export async function listAuditLogs(
  query: AuditListQuery
): Promise<{ logs: AuditLogView[]; total: number; page: number; limit: number }> {
  const { where, params } = buildWhere(query);
  const offset = (query.page - 1) * query.limit;

  const countRes = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM audit_logs a
     LEFT JOIN employees e ON e.id = a.actor_id
     ${where}`,
    params
  );

  const listParams = [...params, query.limit, offset];
  const limitIdx = params.length + 1;
  const offsetIdx = params.length + 2;

  const rows = await pool.query<AuditLogRow>(
    `SELECT ${SELECT_COLS}
     FROM audit_logs a
     LEFT JOIN employees e ON e.id = a.actor_id
     ${where}
     ORDER BY a.created_at DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    listParams
  );

  return {
    logs: rows.rows.map(enrichRow),
    total: parseInt(countRes.rows[0]?.count ?? "0", 10),
    page: query.page,
    limit: query.limit,
  };
}

export async function getAuditLogById(id: string): Promise<AuditLogView | null> {
  const rows = await pool.query<AuditLogRow>(
    `SELECT ${SELECT_COLS}
     FROM audit_logs a
     LEFT JOIN employees e ON e.id = a.actor_id
     WHERE a.id = $1`,
    [id]
  );
  const row = rows.rows[0];
  return row ? enrichRow(row) : null;
}

/** Fetch up to `limit` rows matching filters (for export). */
export async function fetchAuditLogsForExport(
  query: Omit<AuditListQuery, "page" | "limit">,
  limit = 5000
): Promise<AuditLogView[]> {
  const { where, params } = buildWhere({ ...query, page: 1, limit });
  const listParams = [...params, limit];
  const rows = await pool.query<AuditLogRow>(
    `SELECT ${SELECT_COLS}
     FROM audit_logs a
     LEFT JOIN employees e ON e.id = a.actor_id
     ${where}
     ORDER BY a.created_at DESC
     LIMIT $${params.length + 1}`,
    listParams
  );
  return rows.rows.map(enrichRow);
}

export async function clearAllAuditLogs(): Promise<number> {
  const res = await pool.query(`DELETE FROM audit_logs`);
  return res.rowCount ?? 0;
}

export async function deleteAuditLogsOlderThan(days: number): Promise<number> {
  if (!Number.isFinite(days) || days <= 0) return 0;
  const res = await pool.query(
    `DELETE FROM audit_logs WHERE created_at < now() - ($1::text || ' days')::interval`,
    [String(Math.floor(days))]
  );
  return res.rowCount ?? 0;
}

export async function countAuditLogs(): Promise<number> {
  const res = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM audit_logs`
  );
  return parseInt(res.rows[0]?.count ?? "0", 10);
}
