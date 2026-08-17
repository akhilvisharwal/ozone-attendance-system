import { Router } from "express";
import { requireAuth, requireAdminPanel, requirePermission } from "../../middleware/auth";
import * as controller from "./advances.controller";

const router = Router();

router.use(requireAuth);

// Advances are money owed to the company: admin-panel only, never employee-facing.
// Master Admin passes requirePermission implicitly; Junior Admins need manageAdvances.
const manageAdvances = [requireAdminPanel(), requirePermission("manageAdvances")] as const;

router.get("/", ...manageAdvances, controller.listAdvances);
router.get("/balances", ...manageAdvances, controller.getAllBalances);
router.post("/", ...manageAdvances, controller.createAdvance);
router.patch("/:id", ...manageAdvances, controller.updateAdvance);
router.delete("/:id", ...manageAdvances, controller.deleteAdvance);

export default router;
