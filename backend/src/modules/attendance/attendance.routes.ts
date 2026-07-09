import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth";
import { upload } from "../../middleware/upload";
import * as controller from "./attendance.controller";
import * as overridesController from "./attendanceOverrides.controller";

const router = Router();

router.use(requireAuth);

// Timing rules — available to both roles so the check-in screen can show live status.
router.get("/timing-rules", controller.timingRules);

// Daily attendance rule overrides (admin-managed temporary exceptions).
router.get("/overrides/active", overridesController.getActiveOverride);
router.get("/overrides/:id", requireRole("admin"), overridesController.getOverrideById);
router.get("/overrides", requireRole("admin"), overridesController.listOverrides);
router.post("/overrides", requireRole("admin"), overridesController.createOverride);
router.patch("/overrides/:id/enabled", requireRole("admin"), overridesController.setOverrideEnabled);
router.patch("/overrides/:id", requireRole("admin"), overridesController.updateOverride);
router.delete("/overrides/:id", requireRole("admin"), overridesController.deleteOverride);

// Employee-only actions — identity always comes from the authenticated JWT.
router.post("/check-in", requireRole("employee"), upload.single("selfie"), controller.checkIn);
router.post("/check-out", requireRole("employee"), upload.fields([
  { name: "selfie", maxCount: 1 },
  { name: "sitePhotos", maxCount: 5 },
]), controller.checkOut);
router.get("/me/today", requireRole("employee"), controller.myToday);
router.get("/me/check-in-context", requireRole("employee"), controller.myCheckInContext);
router.get("/me/monthly", requireRole("employee"), controller.myMonthly);
router.get("/me/history", requireRole("employee"), controller.myHistory);
router.get("/me/:id", requireRole("employee"), controller.myAttendanceById);

// Admin-only visibility and manual marking.
router.get("/",                                requireRole("admin"), controller.adminList);
router.get("/admin/monthly",                   requireRole("admin"), controller.adminMonthly);
router.get("/admin/monthly/export",            requireRole("admin"), controller.adminMonthlyExport);
router.post("/admin/mark-present",             requireRole("admin"), controller.adminMarkPresent);
router.post("/admin/mark-half-day",            requireRole("admin"), controller.adminMarkHalfDay);
router.post("/admin/mark-absent",              requireRole("admin"), controller.adminMarkAbsent);
router.post("/admin/manual-attendance",        requireRole("admin"), controller.saveManualAttendance);
router.delete("/admin/manual-attendance",      requireRole("admin"), controller.deleteManualAttendance);
router.get("/admin/for-date",                  requireRole("admin"), controller.adminGetForDate);
router.get("/admin/check/:employeeId",         requireRole("admin"), controller.adminCheckToday);
router.get("/:id",                             requireRole("admin"), controller.adminGetById);

export default router;
