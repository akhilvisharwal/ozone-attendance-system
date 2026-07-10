import { Router } from "express";
import { requireAuth, requireMasterAdmin } from "../../middleware/auth";
import * as controller from "./juniorAdmins.controller";

const router = Router();

router.use(requireAuth, requireMasterAdmin());

router.get("/", controller.listJuniorAdmins);
router.post("/", controller.createJuniorAdmin);
router.get("/:id", controller.getJuniorAdmin);
router.patch("/:id", controller.updateJuniorAdmin);
router.patch("/:id/status", controller.setJuniorAdminActive);
router.post("/:id/reset-password", controller.resetJuniorAdminPassword);
router.delete("/:id", controller.deleteJuniorAdmin);

export default router;
