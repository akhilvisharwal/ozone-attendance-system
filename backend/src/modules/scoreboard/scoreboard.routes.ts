import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth";
import * as controller from "./scoreboard.controller";

const router = Router();
router.use(requireAuth);

router.get("/", requireRole("admin"), controller.listScoreboard);

export default router;
