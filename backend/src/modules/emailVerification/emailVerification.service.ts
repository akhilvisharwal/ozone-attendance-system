import crypto from "crypto";
import { Request } from "express";
import { pool } from "../../config/db";
import { env } from "../../config/env";
import { ApiError } from "../../utils/errors";
import { logAudit } from "../audit/audit.repository";
import {
  getAdminNotificationEmail,
  isEmailConfigured,
  sendOtpEmail,
  sendPasswordResetEmail,
} from "../../services/email/email.service";
import {
  consumeOtpChallenge,
  consumePasswordResetToken,
  countRecentOtpRequests,
  countRecentPasswordResetRequests,
  createOtpChallenge,
  createPasswordResetToken,
  findOtpChallengeById,
  findPasswordResetByTokenHash,
  generateOtpCode,
  generateResetToken,
  hashSecret,
  incrementOtpAttempts,
  invalidatePasswordResetTokensForEmployee,
  OTP_PURPOSE_LABELS,
  type OtpPurpose,
} from "./emailVerification.repository";

export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_RESEND_WINDOW_MS = 15 * 60 * 1000;
export const OTP_MAX_REQUESTS_PER_WINDOW = 5;
export const RESET_TTL_MS = 30 * 60 * 1000;
export const RESET_REQUEST_WINDOW_MS = 60 * 60 * 1000;
export const RESET_MAX_REQUESTS_PER_WINDOW = 3;

function timingSafeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}

export async function requestOtpChallenge(input: {
  req: Request;
  purpose: OtpPurpose;
  actorId: string;
  payload?: Record<string, unknown>;
}): Promise<{ challengeId: string; expiresAt: string; maskedEmail: string }> {
  if (!isEmailConfigured() && env.isProduction) {
    throw ApiError.internal("Email verification is not configured. Set RESEND_API_KEY.");
  }

  const since = new Date(Date.now() - OTP_RESEND_WINDOW_MS);
  const recent = await countRecentOtpRequests({
    actorId: input.actorId,
    purpose: input.purpose,
    since,
  });
  if (recent >= OTP_MAX_REQUESTS_PER_WINDOW) {
    throw ApiError.badRequest(
      "Too many verification codes requested. Please wait a few minutes and try again."
    );
  }

  const code = generateOtpCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);
  const recipient = getAdminNotificationEmail();
  const challenge = await createOtpChallenge({
    purpose: input.purpose,
    code,
    recipientEmail: recipient,
    actorId: input.actorId,
    payload: input.payload,
    expiresAt,
  });

  const sendResult = await sendOtpEmail({
    to: recipient,
    code,
    purposeLabel: OTP_PURPOSE_LABELS[input.purpose],
    expiresMinutes: 5,
  });

  if (!sendResult.ok) {
    throw ApiError.internal(sendResult.error ?? "Failed to send verification email");
  }

  await logAudit(input.req, "email.otp_requested", "email_otp", challenge.id, {
    purpose: input.purpose,
    recipient: maskEmail(recipient),
    skipped: Boolean(sendResult.skipped),
  });

  if (sendResult.skipped && !env.isProduction) {
    console.info(`[email-otp] DEV code for ${input.purpose}: ${code} (challenge ${challenge.id})`);
  }

  return {
    challengeId: challenge.id,
    expiresAt: expiresAt.toISOString(),
    maskedEmail: maskEmail(recipient),
  };
}

export async function verifyOtpChallenge(input: {
  req: Request;
  challengeId: string;
  code: string;
  purpose: OtpPurpose;
  actorId: string;
}): Promise<Record<string, unknown>> {
  const challenge = await findOtpChallengeById(input.challengeId);
  if (!challenge) {
    await logAudit(
      input.req,
      "email.otp_failed",
      "email_otp",
      input.challengeId,
      { purpose: input.purpose, reason: "not_found" },
      { status: "failed" }
    );
    throw ApiError.badRequest("Invalid or expired verification code.");
  }

  if (challenge.purpose !== input.purpose) {
    await logAudit(
      input.req,
      "email.otp_failed",
      "email_otp",
      challenge.id,
      { purpose: input.purpose, reason: "purpose_mismatch" },
      { status: "failed" }
    );
    throw ApiError.badRequest("Invalid or expired verification code.");
  }

  if (challenge.actor_id && challenge.actor_id !== input.actorId) {
    await logAudit(
      input.req,
      "email.otp_failed",
      "email_otp",
      challenge.id,
      { purpose: input.purpose, reason: "actor_mismatch" },
      { status: "failed" }
    );
    throw ApiError.forbidden("You do not have permission to use this verification code.");
  }

  if (challenge.consumed_at) {
    await logAudit(
      input.req,
      "email.otp_failed",
      "email_otp",
      challenge.id,
      { purpose: input.purpose, reason: "already_used" },
      { status: "failed" }
    );
    throw ApiError.badRequest("This verification code has already been used.");
  }

  if (new Date(challenge.expires_at).getTime() <= Date.now()) {
    await logAudit(
      input.req,
      "email.otp_failed",
      "email_otp",
      challenge.id,
      { purpose: input.purpose, reason: "expired" },
      { status: "failed" }
    );
    throw ApiError.badRequest("This verification code has expired. Request a new one.");
  }

  if (challenge.attempts >= challenge.max_attempts) {
    await logAudit(
      input.req,
      "email.otp_failed",
      "email_otp",
      challenge.id,
      { purpose: input.purpose, reason: "max_attempts" },
      { status: "failed" }
    );
    throw ApiError.badRequest("Too many incorrect attempts. Request a new verification code.");
  }

  const expected = challenge.code_hash;
  const actual = hashSecret(input.code.trim());
  if (!timingSafeEqualHex(expected, actual)) {
    await incrementOtpAttempts(challenge.id);
    await logAudit(
      input.req,
      "email.otp_failed",
      "email_otp",
      challenge.id,
      { purpose: input.purpose, reason: "invalid_code", attempts: challenge.attempts + 1 },
      { status: "failed" }
    );
    throw ApiError.badRequest("Incorrect verification code.");
  }

  await consumeOtpChallenge(challenge.id);
  await logAudit(input.req, "email.otp_verified", "email_otp", challenge.id, {
    purpose: input.purpose,
  });

  return (challenge.payload ?? {}) as Record<string, unknown>;
}

/** Requires otpChallengeId + otpCode on the request body for a protected action. */
export async function requireVerifiedOtp(input: {
  req: Request;
  purpose: OtpPurpose;
  otpChallengeId?: string;
  otpCode?: string;
}): Promise<Record<string, unknown>> {
  if (!input.otpChallengeId?.trim() || !input.otpCode?.trim()) {
    throw ApiError.badRequest(
      "Email verification is required. Request a verification code and enter it to continue."
    );
  }
  return verifyOtpChallenge({
    req: input.req,
    challengeId: input.otpChallengeId.trim(),
    code: input.otpCode.trim(),
    purpose: input.purpose,
    actorId: input.req.user!.id,
  });
}

const RESET_AUTH_TTL_MS = 10 * 60 * 1000;

/**
 * After step-1 OTP succeeds, issue a short-lived authorization ticket required for step-2 execute.
 * The ticket is stored as a hashed OTP challenge (never emailed).
 */
export async function issueDatabaseResetAuthorization(input: {
  req: Request;
  actorId: string;
}): Promise<{ authorizationId: string; authorizationToken: string; expiresAt: string }> {
  const authorizationToken = generateResetToken();
  const expiresAt = new Date(Date.now() + RESET_AUTH_TTL_MS);
  const recipient = getAdminNotificationEmail();
  const challenge = await createOtpChallenge({
    purpose: "database_reset_authorization",
    code: authorizationToken,
    recipientEmail: recipient,
    actorId: input.actorId,
    expiresAt,
    payload: { kind: "database_reset_authorization" },
    maxAttempts: 3,
  });

  return {
    authorizationId: challenge.id,
    authorizationToken,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function consumeDatabaseResetAuthorization(input: {
  req: Request;
  authorizationId: string;
  authorizationToken: string;
  actorId: string;
}): Promise<void> {
  await verifyOtpChallenge({
    req: input.req,
    challengeId: input.authorizationId,
    code: input.authorizationToken,
    purpose: "database_reset_authorization",
    actorId: input.actorId,
  });
}

export async function requestAdminPasswordReset(input: {
  req: Request;
  employeeCode: string;
}): Promise<{ sent: boolean; maskedEmail: string }> {
  const code = input.employeeCode.trim().toUpperCase();
  const recipient = getAdminNotificationEmail();
  const masked = maskEmail(recipient);

  if (code !== env.adminEmployeeId.toUpperCase()) {
    await logAudit(input.req, "auth.password_reset_requested", "employee", undefined, {
      employeeCode: code,
      matched: false,
    });
    return { sent: true, maskedEmail: masked };
  }

  const admin = await pool.query<{ id: string; role: string; is_active: boolean }>(
    `SELECT id, role, is_active FROM employees
      WHERE UPPER(employee_code) = $1 AND deleted_at IS NULL
      LIMIT 1`,
    [code]
  );
  const row = admin.rows[0];
  if (!row || row.role !== "admin" || !row.is_active) {
    await logAudit(input.req, "auth.password_reset_requested", "employee", undefined, {
      employeeCode: code,
      matched: false,
    });
    return { sent: true, maskedEmail: masked };
  }

  const since = new Date(Date.now() - RESET_REQUEST_WINDOW_MS);
  const recent = await countRecentPasswordResetRequests({ employeeId: row.id, since });
  if (recent >= RESET_MAX_REQUESTS_PER_WINDOW) {
    throw ApiError.badRequest(
      "Too many password reset requests. Please wait before trying again."
    );
  }

  if (!isEmailConfigured() && env.isProduction) {
    throw ApiError.internal("Email is not configured. Set RESEND_API_KEY.");
  }

  const token = generateResetToken();
  const expiresAt = new Date(Date.now() + RESET_TTL_MS);
  await createPasswordResetToken({
    employeeId: row.id,
    token,
    recipientEmail: recipient,
    expiresAt,
  });

  const resetUrl = `${env.appUrl}/reset-password?token=${encodeURIComponent(token)}`;
  const sendResult = await sendPasswordResetEmail({
    to: recipient,
    resetUrl,
    expiresMinutes: 30,
  });

  if (!sendResult.ok) {
    throw ApiError.internal(sendResult.error ?? "Failed to send password reset email");
  }

  await logAudit(input.req, "auth.password_reset_requested", "employee", row.id, {
    employeeCode: code,
    matched: true,
    recipient: masked,
    skipped: Boolean(sendResult.skipped),
  });

  if (sendResult.skipped && !env.isProduction) {
    console.info(`[password-reset] DEV reset URL: ${resetUrl}`);
  }

  return { sent: true, maskedEmail: masked };
}

export async function consumeAdminPasswordResetToken(input: {
  req: Request;
  token: string;
}): Promise<{ employeeId: string }> {
  const tokenHash = hashSecret(input.token.trim());
  const row = await findPasswordResetByTokenHash(tokenHash);
  if (!row) {
    await logAudit(
      input.req,
      "auth.password_reset_failed",
      "employee",
      undefined,
      { reason: "not_found" },
      { status: "failed" }
    );
    throw ApiError.badRequest("Invalid or expired password reset link.");
  }
  if (row.consumed_at) {
    await logAudit(
      input.req,
      "auth.password_reset_failed",
      "employee",
      row.employee_id,
      { reason: "already_used" },
      { status: "failed" }
    );
    throw ApiError.badRequest("This password reset link has already been used.");
  }
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await logAudit(
      input.req,
      "auth.password_reset_failed",
      "employee",
      row.employee_id,
      { reason: "expired" },
      { status: "failed" }
    );
    throw ApiError.badRequest("This password reset link has expired. Request a new one.");
  }

  await consumePasswordResetToken(row.id);
  await invalidatePasswordResetTokensForEmployee(row.employee_id);

  return { employeeId: row.employee_id };
}
