import crypto from "crypto";
import { pool } from "../../config/db";

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function storeRefreshToken(employeeId: string, token: string, expiresAt: Date): Promise<void> {
  await pool.query(
    `INSERT INTO refresh_tokens (employee_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [employeeId, hashToken(token), expiresAt]
  );
}

export async function isRefreshTokenValid(employeeId: string, token: string): Promise<boolean> {
  const result = await pool.query<{ id: string }>(
    `SELECT id FROM refresh_tokens
     WHERE employee_id = $1 AND token_hash = $2 AND revoked_at IS NULL AND expires_at > now()`,
    [employeeId, hashToken(token)]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function revokeRefreshToken(employeeId: string, token: string): Promise<void> {
  await pool.query(
    `UPDATE refresh_tokens SET revoked_at = now()
     WHERE employee_id = $1 AND token_hash = $2`,
    [employeeId, hashToken(token)]
  );
}

export async function revokeAllRefreshTokens(employeeId: string): Promise<void> {
  await pool.query(
    `UPDATE refresh_tokens SET revoked_at = now() WHERE employee_id = $1 AND revoked_at IS NULL`,
    [employeeId]
  );
}
