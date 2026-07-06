import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth";
import * as controller from "./leaves.controller";

const router = Router();
router.use(requireAuth);

// Employee: submit, view own, cancel (pending only)
router.post("/",       requireRole("employee"), controller.submitLeave);
router.get("/mine",    requireRole("employee"), controller.myLeaves);
router.delete("/:id",  requireRole("employee"), controller.cancelLeave);

// Admin: list all, get single, approve/reject
router.get("/",         requireRole("admin"), controller.adminListLeaves);
router.get("/:id",      requireRole("admin"), controller.adminGetLeave);
router.patch("/:id/review", requireRole("admin"), controller.adminReviewLeave);

export default router;
