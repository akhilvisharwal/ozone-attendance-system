import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth";
import { exportReport, viewReport } from "./reports.controller";

const router = Router();

router.use(requireAuth, requireRole("admin"));
router.get("/view", viewReport);
router.get("/export", exportReport);

export default router;
