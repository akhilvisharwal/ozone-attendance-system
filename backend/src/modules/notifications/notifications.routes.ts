import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import * as controller from "./notifications.controller";

const router = Router();
router.use(requireAuth);

router.get("/", controller.listMyNotifications);
router.get("/unread-count", controller.getUnreadCount);
router.patch("/read-all", controller.markAllNotificationsRead);
router.patch("/:id/read", controller.markNotificationRead);

export default router;
