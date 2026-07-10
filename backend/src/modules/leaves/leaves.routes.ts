import { Router } from "express";
import { requireAuth, requireRole, requireMasterAdmin } from "../../middleware/auth";
import * as controller from "./leaves.controller";

const router = Router();
router.use(requireAuth);

router.post("/", requireRole("employee"), controller.submitLeave);
router.get("/mine", requireRole("employee"), controller.myLeaves);
router.delete("/:id", requireRole("employee"), controller.cancelLeave);

// Leave management stays Master Admin only (not in Junior Admin permission set)
router.get("/", requireMasterAdmin(), controller.adminListLeaves);
router.get("/:id", requireMasterAdmin(), controller.adminGetLeave);
router.patch("/:id/review", requireMasterAdmin(), controller.adminReviewLeave);
router.delete("/:id/admin", requireMasterAdmin(), controller.adminDeleteLeave);

export default router;
