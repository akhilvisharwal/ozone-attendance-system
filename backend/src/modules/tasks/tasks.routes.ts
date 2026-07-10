import { Router } from "express";
import {
  requireAuth,
  requireRole,
  requireAdminPanel,
  requirePermission,
  requireAnyPermission,
  requireMasterAdmin,
} from "../../middleware/auth";
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

const canViewTasks = [
  requireAdminPanel(),
  requireAnyPermission("assignTasks", "editTasks", "deleteTasks"),
] as const;

router.get("/analytics", ...canViewTasks, controller.adminGetAnalytics);
router.get("/calendar", ...canViewTasks, controller.adminGetCalendar);
router.get("/extensions/pending", requireMasterAdmin(), controller.listPendingExtensions);
router.patch("/extensions/:id/review", requireMasterAdmin(), controller.reviewExtension);
router.get("/attachments/:attachmentId/download", controller.downloadAttachment);

router.get("/groups", ...canViewTasks, controller.adminListTaskGroups);
router.get("/groups/:groupId", ...canViewTasks, controller.adminGetGroupDetail);
router.patch(
  "/groups/:groupId",
  requireAdminPanel(),
  requirePermission("editTasks"),
  taskUpload.array("attachments", 10),
  controller.adminUpdateTaskGroup
);
router.delete(
  "/groups/:groupId",
  requireAdminPanel(),
  requirePermission("deleteTasks"),
  controller.adminDeleteTaskGroup
);
router.post("/groups/:groupId/comments", ...canViewTasks, controller.addTaskGroupComment);

router.get("/", ...canViewTasks, controller.adminListTaskGroups);
router.post(
  "/",
  requireAdminPanel(),
  requirePermission("assignTasks"),
  taskUpload.array("attachments", 10),
  controller.adminAssignTask
);
router.delete("/all", requireAdminPanel(), requirePermission("deleteTasks"), controller.adminClearAllTasks);
router.get("/:id", ...canViewTasks, controller.adminGetTaskDetail);
router.delete("/:id", requireAdminPanel(), requirePermission("deleteTasks"), controller.adminDeleteTask);
router.post(
  "/:id/attachments",
  requireAdminPanel(),
  requirePermission("editTasks"),
  taskUpload.array("attachments", 10),
  controller.addTaskAttachments
);
router.post("/:id/comments", ...canViewTasks, controller.addTaskComment);

export default router;
