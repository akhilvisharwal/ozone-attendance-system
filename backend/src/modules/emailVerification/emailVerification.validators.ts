import { z } from "zod";
import { REQUESTABLE_OTP_PURPOSES } from "./emailVerification.repository";

export const requestOtpSchema = z.object({
  purpose: z.enum(
    REQUESTABLE_OTP_PURPOSES as [
      (typeof REQUESTABLE_OTP_PURPOSES)[number],
      ...(typeof REQUESTABLE_OTP_PURPOSES)[number][],
    ]
  ),
});

export const otpFieldsSchema = z.object({
  otpChallengeId: z.string().uuid(),
  otpCode: z.string().regex(/^\d{6}$/, "Verification code must be 6 digits"),
});

export const forgotPasswordSchema = z.object({
  employeeId: z.string().min(1).max(50),
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(32).max(200),
    newPassword: z.string().min(8).max(128),
    confirmPassword: z.string().min(8).max(128),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
