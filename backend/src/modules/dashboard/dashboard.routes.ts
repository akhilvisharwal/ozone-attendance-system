import { Router } from "express";
import { requireAuth, requireAdminPanel, requirePermission } from "../../middleware/auth";
import * as controller from "./dashboard.controller";

const router = Router();

router.use(requireAuth, requireAdminPanel(), requirePermission("viewDashboard"));

router.get("/summary", controller.getSummary);
router.get("/today", controller.getTodayAttendance);

export default router;
