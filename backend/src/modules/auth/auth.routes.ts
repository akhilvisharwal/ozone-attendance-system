import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../../middleware/auth";
import { env } from "../../config/env";
import * as controller from "./auth.controller";

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.isProduction ? 30 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: { message: "Too many login attempts. Please try again in 15 minutes." } },
});

router.post("/login", loginLimiter, controller.login);
router.post("/refresh", controller.refresh);
router.post("/heartbeat", controller.heartbeat);
router.post("/logout", controller.logout);
router.get("/me", requireAuth, controller.me);
router.post("/change-password", requireAuth, controller.changePassword);

export default router;
