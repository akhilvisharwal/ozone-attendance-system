import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth";
import { taskUpload } from "../../middleware/taskUpload";
import * as controller from "./tasks.controller";

const router = Router();
router.use(requireAuth);

router.get("/me/analytics", requireRole("employee"), controller.getMyAnalytics);
router.get("/me/calendar", requireRole("employee"), controller.getMyCalendar);
router.get("/me", requireRole("employee"), controller.listMyTasks);
router.post("/me", requireRole("employee"), controller.createMyTask);
router.get("/me/:id", requireRole("employee"), controller.getMyTaskDetail);
router.patch("/me/:id", requireRole("employee"), controller.updateMyTask);
router.post("/me/:id/extension", requireRole("employee"), controller.requestExtension);
router.post("/me/:id/comments", requireRole("employee"), controller.addTaskComment);
router.delete("/me/:id", requireRole("employee"), controller.deleteMyTask);

router.get("/analytics", requireRole("admin"), controller.adminGetAnalytics);
router.get("/calendar", requireRole("admin"), controller.adminGetCalendar);
router.get("/extensions/pending", requireRole("admin"), controller.listPendingExtensions);
router.patch("/extensions/:id/review", requireRole("admin"), controller.reviewExtension);
router.get("/attachments/:attachmentId/download", controller.downloadAttachment);

router.get("/groups", requireRole("admin"), controller.adminListTaskGroups);
router.get("/groups/:groupId", requireRole("admin"), controller.adminGetGroupDetail);
router.patch(
  "/groups/:groupId",
  requireRole("admin"),
  taskUpload.array("attachments", 10),
  controller.adminUpdateTaskGroup
);
router.delete("/groups/:groupId", requireRole("admin"), controller.adminDeleteTaskGroup);
router.post("/groups/:groupId/comments", requireRole("admin"), controller.addTaskGroupComment);

router.get("/", requireRole("admin"), controller.adminListTaskGroups);
router.post("/", requireRole("admin"), taskUpload.array("attachments", 10), controller.adminAssignTask);
router.delete("/all", requireRole("admin"), controller.adminClearAllTasks);
router.get("/:id", requireRole("admin"), controller.adminGetTaskDetail);
router.delete("/:id", requireRole("admin"), controller.adminDeleteTask);
router.post("/:id/attachments", taskUpload.array("attachments", 10), controller.addTaskAttachments);
router.post("/:id/comments", controller.addTaskComment);

export default router;
