import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import * as controller from "./notifications.controller";

const router = Router();

/** Public Firebase web config (API key / VAPID are designed to be client-visible). */
router.get("/push/config", controller.getPushConfig);

router.use(requireAuth);

router.post("/push/devices", controller.registerPushDevice);
router.delete("/push/devices", controller.unregisterPushDevice);
router.get("/push/preferences", controller.getMyPushPreferences);
router.put("/push/preferences", controller.updateMyPushPreferences);

router.get("/", controller.listMyNotifications);
router.get("/unread-count", controller.getUnreadCount);
router.patch("/read-all", controller.markAllNotificationsRead);
router.patch("/:id/read", controller.markNotificationRead);
router.delete("/:id", controller.deleteNotification);

export default router;
