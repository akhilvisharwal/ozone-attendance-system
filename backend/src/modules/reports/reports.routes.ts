import { Router } from "express";
import { requireAuth, requireAdminPanel, requirePermission } from "../../middleware/auth";
import { exportReport, viewReport } from "./reports.controller";

const router = Router();

router.use(requireAuth, requireAdminPanel(), requirePermission("viewReports"));
router.get("/view", viewReport);
router.get("/export", exportReport);

export default router;
