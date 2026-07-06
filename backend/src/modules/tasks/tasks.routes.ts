import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth";
import * as controller from "./tasks.controller";

const router = Router();
router.use(requireAuth);

// Employee routes
router.get("/me", requireRole("employee"), controller.listMyTasks);
router.post("/me", requireRole("employee"), controller.createMyTask);
router.patch("/me/:id/status", requireRole("employee"), controller.updateMyTaskStatus);
router.delete("/me/:id", requireRole("employee"), controller.deleteMyTask);

// Admin routes
router.get("/", requireRole("admin"), controller.adminListTasks);
router.post("/", requireRole("admin"), controller.adminCreateTask);
router.patch("/:id", requireRole("admin"), controller.adminUpdateTask);

export default router;
