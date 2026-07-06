import { Request } from "express";
import { pool } from "../../config/db";

export async function logAudit(
  req: Request,
  action: string,
  targetType?: string,
  targetId?: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO audit_logs (actor_id, action, target_type, target_id, metadata, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [req.user?.id ?? null, action, targetType ?? null, targetId ?? null, JSON.stringify(metadata), req.ip]
    );
  } catch (err) {
    console.error("Failed to write audit log:", err);
  }
}
