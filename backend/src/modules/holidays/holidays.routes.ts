import { Router } from "express";
import { requireAuth, requireMasterAdmin } from "../../middleware/auth";
import * as controller from "./holidays.controller";

const router = Router();

router.use(requireAuth);

router.get("/upcoming", controller.upcomingHolidays);
router.get("/", controller.listHolidays);
router.get("/:id", controller.getHoliday);

router.post("/", requireMasterAdmin(), controller.createHoliday);
router.post("/date/:date", requireMasterAdmin(), controller.createHolidayForDate);
router.patch("/:id", requireMasterAdmin(), controller.updateHoliday);
router.delete("/:id", requireMasterAdmin(), controller.deleteHoliday);

export default router;
