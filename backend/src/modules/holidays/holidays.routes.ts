import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth";
import * as controller from "./holidays.controller";

const router = Router();

router.use(requireAuth);

router.get("/upcoming", controller.upcomingHolidays);
router.get("/", controller.listHolidays);
router.get("/:id", controller.getHoliday);

router.post("/", requireRole("admin"), controller.createHoliday);
router.post("/date/:date", requireRole("admin"), controller.createHolidayForDate);
router.patch("/:id", requireRole("admin"), controller.updateHoliday);
router.delete("/:id", requireRole("admin"), controller.deleteHoliday);

export default router;
