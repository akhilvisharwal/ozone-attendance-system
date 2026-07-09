import { Router } from "express";
import multer from "multer";
import { requireAuth, requireRole } from "../../middleware/auth";
import * as controller from "./settings.controller";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024 } });
const backupUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 64 * 1024 * 1024 },
});

router.use(requireAuth);

router.get("/public", controller.getPublicSettings);
router.get("/", requireRole("admin"), controller.getAllSettings);
router.get("/audit-logs", requireRole("admin"), controller.listAuditLogs);
router.get("/audit-logs/export/:format", requireRole("admin"), controller.exportAuditLogs);
router.post("/audit-logs/clear", requireRole("admin"), controller.clearAuditLogs);
router.get("/audit-logs/:id", requireRole("admin"), controller.getAuditLog);
router.get("/backup/status", requireRole("admin"), controller.getBackupStatus);
router.get("/backup/storage", requireRole("admin"), controller.getStorageStatus);
router.get("/backup/cleanup/options", requireRole("admin"), controller.getCleanupOptions);
router.post("/backup/cleanup", requireRole("admin"), controller.cleanupData);
router.post("/backup/run", requireRole("admin"), controller.runBackupNow);
router.post(
  "/backup/restore",
  requireRole("admin"),
  backupUpload.single("backup"),
  controller.restoreBackup
);
router.get("/backup/export/:type", requireRole("admin"), controller.exportBackupData);
router.get("/backup/report/:format", requireRole("admin"), controller.exportReadableReport);
router.get("/export", requireRole("admin"), controller.exportData);
router.post("/refresh", requireRole("admin"), controller.refreshSettings);
router.patch("/:category", requireRole("admin"), controller.updateSettings);
router.post("/company/logo", requireRole("admin"), upload.single("logo"), controller.uploadCompanyLogo);
router.post("/security/change-password", requireRole("admin"), controller.changeAdminPassword);

export default router;
