import { Router } from "express";
import { requireAuth, requireRole, requirePermission, requireAnyPermission, requireMasterAdmin, requireAdminPanel } from "../../middleware/auth";
import { upload } from "../../middleware/upload";
import * as controller from "./attendance.controller";
import * as overridesController from "./attendanceOverrides.controller";

const router = Router();

router.use(requireAuth);

// Timing rules — available to both roles so the check-in screen can show live status.
router.get("/timing-rules", controller.timingRules);

// Daily attendance rule overrides (Master Admin only — settings-level).
router.get("/overrides/active", overridesController.getActiveOverride);
router.get("/overrides/:id", requireMasterAdmin(), overridesController.getOverrideById);
router.get("/overrides", requireMasterAdmin(), overridesController.listOverrides);
router.post("/overrides", requireMasterAdmin(), overridesController.createOverride);
router.patch("/overrides/:id/enabled", requireMasterAdmin(), overridesController.setOverrideEnabled);
router.patch("/overrides/:id", requireMasterAdmin(), overridesController.updateOverride);
router.delete("/overrides/:id", requireMasterAdmin(), overridesController.deleteOverride);

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

// Admin panel attendance — permission gated for Junior Admins.
router.get("/", requireAdminPanel(), requirePermission("viewAttendance"), controller.adminList);
router.get("/admin/monthly", requireAdminPanel(), requirePermission("viewAttendance"), controller.adminMonthly);
router.get(
  "/admin/monthly/export",
  requireAdminPanel(),
  // Same gate as the monthly calendar — Junior Admins export only what they can view.
  requirePermission("viewAttendance"),
  controller.adminMonthlyExport
);
router.post(
  "/admin/mark-present",
  requireAdminPanel(),
  requirePermission("editAttendance"),
  controller.adminMarkPresent
);
router.post(
  "/admin/mark-half-day",
  requireAdminPanel(),
  requirePermission("editAttendance"),
  controller.adminMarkHalfDay
);
router.post(
  "/admin/mark-absent",
  requireAdminPanel(),
  requirePermission("editAttendance"),
  controller.adminMarkAbsent
);
router.post(
  "/admin/manual-attendance",
  requireAdminPanel(),
  requireAnyPermission("manualAttendance", "editAttendance"),
  controller.saveManualAttendance
);
router.delete(
  "/admin/manual-attendance",
  requireAdminPanel(),
  requireAnyPermission("manualAttendance", "editAttendance"),
  controller.deleteManualAttendance
);
router.get(
  "/admin/for-date",
  requireAdminPanel(),
  requirePermission("viewAttendance"),
  controller.adminGetForDate
);
router.get(
  "/admin/check/:employeeId",
  requireAdminPanel(),
  requirePermission("viewAttendance"),
  controller.adminCheckToday
);
router.post(
  "/admin/remind",
  requireAdminPanel(),
  requirePermission("sendAttendanceReminders"),
  controller.sendAttendanceReminders
);
router.get("/:id", requireAdminPanel(), requirePermission("viewAttendance"), controller.adminGetById);

export default router;
