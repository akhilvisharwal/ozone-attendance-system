import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth";
import { upload } from "../../middleware/upload";
import * as controller from "./sites.controller";

const router = Router();

router.use(requireAuth);

// Employees need the list to pick a project/site at checkout, but only admins may manage sites.
router.get("/", controller.listSites);
router.post("/", requireRole("admin"), controller.createSite);
router.patch("/:id", requireRole("admin"), controller.updateSite);
router.patch("/:id/image", requireRole("admin"), upload.single("image"), controller.updateSiteImage);
router.delete("/:id/image", requireRole("admin"), controller.deleteSiteImage);
router.get("/:id/dependencies", requireRole("admin"), controller.getSiteDependencies);
router.delete("/:id", requireRole("admin"), controller.deleteSite);

export default router;
