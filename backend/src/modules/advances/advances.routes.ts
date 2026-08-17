import { Router } from "express";
import { requireAuth, requireAdminPanel, requirePermission } from "../../middleware/auth";
import * as controller from "./advances.controller";
import * as plansController from "./advancePlans.controller";

const router = Router();

router.use(requireAuth);

// Advances are money owed to the company: admin-panel only, never employee-facing.
// Master Admin passes requirePermission implicitly; Junior Admins need manageAdvances.
const manageAdvances = [requireAdminPanel(), requirePermission("manageAdvances")] as const;

// Repayment plans — the primary interface (dedicated Advances page).
router.get("/plans/summaries", ...manageAdvances, plansController.listSummaries);
router.get("/plans", ...manageAdvances, plansController.listPlansForEmployee);
router.get("/plans/:id", ...manageAdvances, plansController.getPlan);
router.post("/plans", ...manageAdvances, plansController.createPlan);
router.patch("/plans/:id", ...manageAdvances, plansController.updatePlan);
router.post("/plans/:id/cancel", ...manageAdvances, plansController.cancelPlan);
router.delete("/plans/:id", ...manageAdvances, plansController.deletePlan);
router.post("/plans/repayments", ...manageAdvances, plansController.recordRepayment);

// Raw ledger — kept for one-off entries not tied to a plan (see advances.controller.ts
// guards: entries linked to a plan can only be edited/deleted through the plan above).
router.get("/", ...manageAdvances, controller.listAdvances);
router.get("/balances", ...manageAdvances, controller.getAllBalances);
router.post("/", ...manageAdvances, controller.createAdvance);
router.patch("/:id", ...manageAdvances, controller.updateAdvance);
router.delete("/:id", ...manageAdvances, controller.deleteAdvance);

export default router;
