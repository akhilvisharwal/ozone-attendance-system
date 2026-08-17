import { Router } from "express";
import { requireAuth, requireAdminPanel, requirePermission } from "../../middleware/auth";
import * as controller from "./holidays.controller";

const router = Router();

router.use(requireAuth);

router.get("/upcoming", controller.upcomingHolidays);
router.get("/", controller.listHolidays);
router.get("/:id", controller.getHoliday);

// Holiday management: Master Admin always passes; Junior Admin needs manageHolidays.
const manageHolidays = [requireAdminPanel(), requirePermission("manageHolidays")] as const;

router.post("/", ...manageHolidays, controller.createHoliday);
router.post("/date/:date", ...manageHolidays, controller.createHolidayForDate);
router.patch("/:id", ...manageHolidays, controller.updateHoliday);
router.delete("/:id", ...manageHolidays, controller.deleteHoliday);

export default router;
