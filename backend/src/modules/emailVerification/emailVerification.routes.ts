import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth, requireMasterAdmin } from "../../middleware/auth";
import { env } from "../../config/env";
import * as controller from "./emailVerification.controller";

const router = Router();

const otpRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.isProduction ? 20 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: "Too many verification requests. Please try again later." } },
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: env.isProduction ? 10 : 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: "Too many password reset requests. Please try again later." } },
});

router.post(
  "/otp/request",
  requireAuth,
  requireMasterAdmin(),
  otpRequestLimiter,
  controller.requestOtp
);

export const publicEmailVerificationRoutes = Router();
publicEmailVerificationRoutes.post(
  "/forgot-password",
  forgotPasswordLimiter,
  controller.forgotPassword
);
publicEmailVerificationRoutes.post(
  "/reset-password",
  forgotPasswordLimiter,
  controller.resetPassword
);

export default router;
