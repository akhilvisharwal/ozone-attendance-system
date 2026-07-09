import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth";
import { upload } from "../../middleware/upload";
import * as controller from "./employees.controller";
import * as designationsController from "./designations.controller";

const router = Router();

router.use(requireAuth);

// Employee self-service: update own avatar
router.patch("/me/avatar", requireRole("employee"), upload.single("avatar"), controller.updateMyAvatar);

// Designation / job-role catalog (admin)
router.get("/designations", requireRole("admin"), designationsController.listDesignations);
router.post("/designations", requireRole("admin"), designationsController.createDesignation);
router.patch("/designations/:id", requireRole("admin"), designationsController.updateDesignation);
router.delete("/designations/:id", requireRole("admin"), designationsController.deleteDesignation);

// Admin-only management routes
router.post("/", requireRole("admin"), controller.createEmployee);
router.get("/active", requireRole("admin"), controller.listActiveEmployees);
router.get("/", requireRole("admin"), controller.listEmployees);
router.get("/:id", requireRole("admin"), controller.getEmployee);
router.patch("/:id", requireRole("admin"), controller.updateEmployee);
router.patch("/:id/status", requireRole("admin"), controller.setEmployeeActive);
router.post("/:id/reset-password", requireRole("admin"), controller.resetEmployeePassword);
router.patch("/:id/weekly-off", requireRole("admin"), controller.updateWeeklyOff);
router.get("/:id/dependencies", requireRole("admin"), controller.getEmployeeDependencies);
router.delete("/:id", requireRole("admin"), controller.deleteEmployee);

// Admin management of an employee's profile photo
router.patch("/:id/avatar", requireRole("admin"), upload.single("avatar"), controller.adminUpdateEmployeeAvatar);
router.delete("/:id/avatar", requireRole("admin"), controller.adminDeleteEmployeeAvatar);

export default router;
