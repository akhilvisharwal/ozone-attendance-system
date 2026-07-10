import { Router } from "express";
import { requireAuth, requireMasterAdmin } from "../../middleware/auth";
import * as controller from "./scoreboard.controller";

const router = Router();
router.use(requireAuth);

router.get("/", requireMasterAdmin(), controller.listScoreboard);

export default router;
