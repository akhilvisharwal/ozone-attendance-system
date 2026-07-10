import { Router } from "express";
import multer from "multer";
import { requireAuth, requireMasterAdmin } from "../../middleware/auth";
import * as controller from "./settings.controller";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024 } });
const backupUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 64 * 1024 * 1024 },
});

router.use(requireAuth);

// Public subset — any authenticated user (including Junior Admin)
router.get("/public", controller.getPublicSettings);

// All settings / audit / backup / security — Master Admin only
router.get("/", requireMasterAdmin(), controller.getAllSettings);
router.get("/audit-logs", requireMasterAdmin(), controller.listAuditLogs);
router.get("/audit-logs/export/:format", requireMasterAdmin(), controller.exportAuditLogs);
router.post("/audit-logs/clear", requireMasterAdmin(), controller.clearAuditLogs);
router.get("/audit-logs/:id", requireMasterAdmin(), controller.getAuditLog);
router.get("/backup/status", requireMasterAdmin(), controller.getBackupStatus);
router.get("/backup/storage", requireMasterAdmin(), controller.getStorageStatus);
router.get("/backup/cleanup/options", requireMasterAdmin(), controller.getCleanupOptions);
router.post("/backup/cleanup", requireMasterAdmin(), controller.cleanupData);
router.post("/backup/run", requireMasterAdmin(), controller.runBackupNow);
router.post(
  "/backup/restore",
  requireMasterAdmin(),
  backupUpload.single("backup"),
  controller.restoreBackup
);
router.get("/backup/export/:type", requireMasterAdmin(), controller.exportBackupData);
router.get("/backup/report/:format", requireMasterAdmin(), controller.exportReadableReport);
router.get("/export", requireMasterAdmin(), controller.exportData);
router.post("/refresh", requireMasterAdmin(), controller.refreshSettings);
router.patch("/:category", requireMasterAdmin(), controller.updateSettings);
router.post("/company/logo", requireMasterAdmin(), upload.single("logo"), controller.uploadCompanyLogo);
router.post("/security/change-password", requireMasterAdmin(), controller.changeAdminPassword);

export default router;
