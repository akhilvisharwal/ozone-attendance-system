import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth";
import * as controller from "./dashboard.controller";

const router = Router();

router.use(requireAuth, requireRole("admin"));

router.get("/summary", controller.getSummary);
router.get("/today", controller.getTodayAttendance);

export default router;
