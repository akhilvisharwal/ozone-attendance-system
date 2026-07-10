import { Router } from "express";
import {
  requireAuth,
  requireAdminPanel,
  requireMasterAdmin,
  requirePermission,
} from "../../middleware/auth";
import { expenseUpload } from "../../middleware/expenseUpload";
import * as controller from "./expenses.controller";

const router = Router();

router.use(requireAuth);

const manageExpenses = [requireAdminPanel(), requirePermission("manageExpenses")] as const;

// Junior Admin — own expenses & reimbursement requests
router.get("/options", ...manageExpenses, controller.getExpenseOptions);
router.get("/mine", ...manageExpenses, controller.listMyExpenses);
router.get("/requests/mine", ...manageExpenses, controller.listMyRequests);
router.post("/requests", ...manageExpenses, controller.submitReimbursementRequest);
router.post("/mine", ...manageExpenses, expenseUpload.single("receipt"), controller.createMyExpense);
router.patch("/mine/:id", ...manageExpenses, expenseUpload.single("receipt"), controller.updateMyExpense);
router.delete("/mine/:id", ...manageExpenses, controller.deleteMyExpense);

// Reports — Junior Admin (own) and Master Admin (all or filtered)
router.get("/reports/export", ...manageExpenses, controller.exportExpenseReport);

// Master Admin — reimbursement approval workflow
router.get("/requests/summary", requireMasterAdmin(), controller.getReimbursementSummary);
router.get("/requests", requireMasterAdmin(), controller.adminListRequests);
router.get("/requests/:id", requireMasterAdmin(), controller.adminGetRequest);
router.patch(
  "/requests/:requestId/expenses/:expenseId/review",
  requireMasterAdmin(),
  controller.adminReviewRequestExpense
);
router.post("/requests/:id/approve-remaining", requireMasterAdmin(), controller.adminApproveAllRemaining);
router.patch("/requests/:id/review", requireMasterAdmin(), controller.adminReviewRequest);
router.post("/requests/:id/paid", requireMasterAdmin(), controller.adminMarkRequestPaid);
router.post("/requests/:id/archive", requireMasterAdmin(), controller.adminArchiveRequest);

// Legacy line-item endpoints (kept for backward compatibility)
router.get("/", requireMasterAdmin(), controller.adminListExpenses);
router.patch("/:id/review", requireMasterAdmin(), controller.adminReviewExpense);
router.post("/weeks/paid", requireMasterAdmin(), controller.adminMarkWeekPaid);

export default router;
