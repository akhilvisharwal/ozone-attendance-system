import crypto from "crypto";
import { pool } from "../../config/db";

export const OTP_PURPOSES = [
  "admin_password_change",
  "database_cleanup",
  "company_email_change",
  "company_phone_change",
] as const;

export type OtpPurpose = (typeof OTP_PURPOSES)[number];

export const OTP_PURPOSE_LABELS: Record<OtpPurpose, string> = {
  admin_password_change: "Change System Admin password",
  database_cleanup: "Delete database records / cleanup",
  company_email_change: "Change company email address",
  company_phone_change: "Change company mobile number",
};

export type EmailOtpChallenge = {
  id: string;
  purpose: OtpPurpose;
  code_hash: string;
  recipient_email: string;
  actor_id: string | null;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
  expires_at: Date;
  consumed_at: Date | null;
  created_at: Date;
};

export type PasswordResetToken = {
  id: string;
  employee_id: string;
  token_hash: string;
  recipient_email: string;
  expires_at: Date;
  consumed_at: Date | null;
  created_at: Date;
};

export function hashSecret(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function generateOtpCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

export function generateResetToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export async function createOtpChallenge(input: {
  purpose: OtpPurpose;
  code: string;
  recipientEmail: string;
  actorId: string;
  payload?: Record<string, unknown>;
  expiresAt: Date;
  maxAttempts?: number;
}): Promise<EmailOtpChallenge> {
  const result = await pool.query<EmailOtpChallenge>(
    `INSERT INTO email_otp_challenges
       (purpose, code_hash, recipient_email, actor_id, payload, expires_at, max_attempts)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
     RETURNING *`,
    [
      input.purpose,
      hashSecret(input.code),
      input.recipientEmail.toLowerCase(),
      input.actorId,
      JSON.stringify(input.payload ?? {}),
      input.expiresAt,
      input.maxAttempts ?? 5,
    ]
  );
  return result.rows[0];
}

export async function findOtpChallengeById(id: string): Promise<EmailOtpChallenge | null> {
  const result = await pool.query<EmailOtpChallenge>(
    `SELECT * FROM email_otp_challenges WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function countRecentOtpRequests(input: {
  actorId: string;
  purpose: OtpPurpose;
  since: Date;
}): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
       FROM email_otp_challenges
      WHERE actor_id = $1
        AND purpose = $2
        AND created_at >= $3`,
    [input.actorId, input.purpose, input.since]
  );
  return parseInt(result.rows[0]?.count ?? "0", 10);
}

export async function incrementOtpAttempts(id: string): Promise<void> {
  await pool.query(
    `UPDATE email_otp_challenges SET attempts = attempts + 1 WHERE id = $1`,
    [id]
  );
}

export async function consumeOtpChallenge(id: string): Promise<void> {
  await pool.query(
    `UPDATE email_otp_challenges SET consumed_at = now() WHERE id = $1 AND consumed_at IS NULL`,
    [id]
  );
}

export async function createPasswordResetToken(input: {
  employeeId: string;
  token: string;
  recipientEmail: string;
  expiresAt: Date;
}): Promise<PasswordResetToken> {
  const result = await pool.query<PasswordResetToken>(
    `INSERT INTO password_reset_tokens
       (employee_id, token_hash, recipient_email, expires_at)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [input.employeeId, hashSecret(input.token), input.recipientEmail.toLowerCase(), input.expiresAt]
  );
  return result.rows[0];
}

export async function findPasswordResetByTokenHash(
  tokenHash: string
): Promise<PasswordResetToken | null> {
  const result = await pool.query<PasswordResetToken>(
    `SELECT * FROM password_reset_tokens WHERE token_hash = $1`,
    [tokenHash]
  );
  return result.rows[0] ?? null;
}

export async function consumePasswordResetToken(id: string): Promise<void> {
  await pool.query(
    `UPDATE password_reset_tokens SET consumed_at = now() WHERE id = $1 AND consumed_at IS NULL`,
    [id]
  );
}

/** Invalidates all unused reset tokens for an employee (after successful reset). */
export async function invalidatePasswordResetTokensForEmployee(employeeId: string): Promise<void> {
  await pool.query(
    `UPDATE password_reset_tokens
        SET consumed_at = COALESCE(consumed_at, now())
      WHERE employee_id = $1
        AND consumed_at IS NULL`,
    [employeeId]
  );
}

export async function countRecentPasswordResetRequests(input: {
  employeeId: string;
  since: Date;
}): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
       FROM password_reset_tokens
      WHERE employee_id = $1
        AND created_at >= $2`,
    [input.employeeId, input.since]
  );
  return parseInt(result.rows[0]?.count ?? "0", 10);
}
