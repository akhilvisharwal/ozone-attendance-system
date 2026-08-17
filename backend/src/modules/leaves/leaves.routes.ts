import { Router } from "express";
import { requireAuth, requireRole, requireAdminPanel, requirePermission } from "../../middleware/auth";
import * as controller from "./leaves.controller";

const router = Router();
router.use(requireAuth);

router.post("/", requireRole("employee"), controller.submitLeave);
router.get("/mine", requireRole("employee"), controller.myLeaves);
router.delete("/:id", requireRole("employee"), controller.cancelLeave);

// Leave management: Master Admin always passes; Junior Admin needs manageLeaves.
const manageLeaves = [requireAdminPanel(), requirePermission("manageLeaves")] as const;

router.get("/", ...manageLeaves, controller.adminListLeaves);
router.get("/:id", ...manageLeaves, controller.adminGetLeave);
router.patch("/:id/review", ...manageLeaves, controller.adminReviewLeave);
router.delete("/:id/admin", ...manageLeaves, controller.adminDeleteLeave);

export default router;
