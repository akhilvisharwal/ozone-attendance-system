import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/errors";
import { pool } from "../../config/db";
import { logAudit } from "../audit/audit.repository";
import { validatePasswordPolicy } from "../../utils/settingsHelpers";
import { revokeAllRefreshTokens } from "../auth/auth.repository";
import {
  requestAdminPasswordReset,
  requestOtpChallenge,
  consumeAdminPasswordResetToken,
} from "./emailVerification.service";
import {
  forgotPasswordSchema,
  requestOtpSchema,
  resetPasswordSchema,
} from "./emailVerification.validators";

export const requestOtp = asyncHandler(async (req: Request, res: Response) => {
  const input = requestOtpSchema.parse(req.body);
  const result = await requestOtpChallenge({
    req,
    purpose: input.purpose,
    actorId: req.user!.id,
  });
  res.json({
    challengeId: result.challengeId,
    expiresAt: result.expiresAt,
    maskedEmail: result.maskedEmail,
    message: `A verification code was sent to ${result.maskedEmail}.`,
  });
});

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const input = forgotPasswordSchema.parse(req.body);
  const result = await requestAdminPasswordReset({
    req,
    employeeCode: input.employeeId,
  });
  res.json({
    success: true,
    message: `If a System Admin account matches, a reset link was sent to ${result.maskedEmail}.`,
    maskedEmail: result.maskedEmail,
  });
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const input = resetPasswordSchema.parse(req.body);
  const policyError = validatePasswordPolicy(input.newPassword);
  if (policyError) throw ApiError.badRequest(policyError);

  const { employeeId } = await consumeAdminPasswordResetToken({
    req,
    token: input.token,
  });

  const hash = await bcrypt.hash(input.newPassword, 12);
  await pool.query(
    `UPDATE employees
        SET password_hash = $1,
            must_change_password = false,
            first_login_completed = true,
            password_changed_at = now(),
            updated_at = now()
      WHERE id = $2 AND role = 'admin' AND deleted_at IS NULL`,
    [hash, employeeId]
  );

  await revokeAllRefreshTokens(employeeId);

  await logAudit(req, "auth.password_reset_completed", "employee", employeeId, {
    via: "email_reset_link",
  });

  res.json({
    success: true,
    message: "Password updated successfully. You can now sign in with your new password.",
  });
});
