import { Router } from "express";
import {
  requireAuth,
  requireRole,
  requireMasterAdmin,
  requireAdminPanel,
  requirePermission,
} from "../../middleware/auth";
import { profilePhotoUpload } from "../../middleware/profilePhotoUpload";
import * as controller from "./employees.controller";
import * as designationsController from "./designations.controller";

const router = Router();

router.use(requireAuth);

// Self-service profile photo — System Admin, Junior Admin, and Employees
router.patch(
  "/me/avatar",
  requireRole("admin", "junior_admin", "employee"),
  profilePhotoUpload.single("avatar"),
  controller.updateMyAvatar
);
router.delete(
  "/me/avatar",
  requireRole("admin", "junior_admin", "employee"),
  controller.deleteMyAvatar
);

// Designation / job-role catalog (read for Junior Admins with viewEmployees)
router.get(
  "/designations",
  requireAdminPanel(),
  requirePermission("viewEmployees"),
  designationsController.listDesignations
);
router.post("/designations", requireMasterAdmin(), designationsController.createDesignation);
router.patch("/designations/:id", requireMasterAdmin(), designationsController.updateDesignation);
router.delete("/designations/:id", requireMasterAdmin(), designationsController.deleteDesignation);

// View employees (Junior Admin with viewEmployees; Master Admin always)
router.get("/active", requireAdminPanel(), requirePermission("viewEmployees"), controller.listActiveEmployees);
router.get("/", requireAdminPanel(), requirePermission("viewEmployees"), controller.listEmployees);
router.get("/:id", requireAdminPanel(), requirePermission("viewEmployees"), controller.getEmployee);

// Mutating employee management — Master Admin only
router.post("/", requireMasterAdmin(), controller.createEmployee);
router.patch("/:id", requireMasterAdmin(), controller.updateEmployee);
router.patch("/:id/status", requireMasterAdmin(), controller.setEmployeeActive);
router.post("/:id/reset-password", requireMasterAdmin(), controller.resetEmployeePassword);
router.patch("/:id/weekly-off", requireMasterAdmin(), controller.updateWeeklyOff);
router.get("/:id/dependencies", requireMasterAdmin(), controller.getEmployeeDependencies);
router.delete("/:id", requireMasterAdmin(), controller.deleteEmployee);
router.patch("/:id/avatar", requireMasterAdmin(), profilePhotoUpload.single("avatar"), controller.adminUpdateEmployeeAvatar);
router.delete("/:id/avatar", requireMasterAdmin(), controller.adminDeleteEmployeeAvatar);

export default router;
