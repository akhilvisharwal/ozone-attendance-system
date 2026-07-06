import { Router } from "express";
import multer from "multer";
import { requireAuth, requireRole } from "../../middleware/auth";
import * as controller from "./settings.controller";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024 } });

router.use(requireAuth);

router.get("/public", controller.getPublicSettings);
router.get("/", requireRole("admin"), controller.getAllSettings);
router.get("/audit-logs", requireRole("admin"), controller.listAuditLogs);
router.get("/export", requireRole("admin"), controller.exportData);
router.post("/refresh", requireRole("admin"), controller.refreshSettings);
router.patch("/:category", requireRole("admin"), controller.updateSettings);
router.post("/company/logo", requireRole("admin"), upload.single("logo"), controller.uploadCompanyLogo);
router.post("/security/change-password", requireRole("admin"), controller.changeAdminPassword);

export default router;
