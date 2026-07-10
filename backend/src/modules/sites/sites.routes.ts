import { Router } from "express";
import { requireAuth, requireMasterAdmin } from "../../middleware/auth";
import { upload } from "../../middleware/upload";
import * as controller from "./sites.controller";

const router = Router();

router.use(requireAuth);

router.get("/", controller.listSites);
router.post("/", requireMasterAdmin(), controller.createSite);
router.patch("/:id", requireMasterAdmin(), controller.updateSite);
router.patch("/:id/image", requireMasterAdmin(), upload.single("image"), controller.updateSiteImage);
router.delete("/:id/image", requireMasterAdmin(), controller.deleteSiteImage);
router.get("/:id/dependencies", requireMasterAdmin(), controller.getSiteDependencies);
router.delete("/:id", requireMasterAdmin(), controller.deleteSite);

export default router;
