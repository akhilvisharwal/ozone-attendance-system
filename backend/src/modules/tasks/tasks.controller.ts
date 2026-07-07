import { Request, Response } from "express";
import { pool } from "../../config/db";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/errors";
import { storage } from "../../services/storage";
import { todayDateString } from "../../utils/date";
import { logAudit } from "../audit/audit.repository";
import * as notificationsRepo from "../notifications/notifications.repository";
import * as repo from "./tasks.repository";
import {
  addCommentSchema,
  adminAssignTaskSchema,
  adminUpdateTaskGroupSchema,
  calendarQuerySchema,
  createSelfTaskSchema,
  extensionRequestSchema,
  groupIdParamSchema,
  listTasksQuerySchema,
  reviewExtensionSchema,
  updateMyTaskSchema,
} from "./tasks.validators";

async function enrichTaskForEmployee(task: repo.TaskRow, employeeId: string) {
  const groupId = task.group_id ?? task.id;
  const [attachments, comments, assignees] = await Promise.all([
    repo.listAttachments(groupId),
    repo.listComments(groupId),
    repo.listGroupAssignees(groupId),
  ]);
  const teamMembers = assignees.map((assignee) => ({
    employee_id: assignee.employee_id,
    employee_name: assignee.employee_name ?? "",
    employee_code: assignee.employee_code ?? "",
    status: assignee.status,
    is_current_user: assignee.employee_id === employeeId,
  }));

  return {
    task,
    attachments,
    comments,
    teamMembers,
    isGroupTask: teamMembers.length > 1,
    assigneeCount: teamMembers.length,
  };
}

async function enrichTask(task: repo.TaskRow) {
  const groupId = task.group_id ?? task.id;
  const [attachments, comments, assignees] = await Promise.all([
    repo.listAttachments(groupId),
    repo.listComments(groupId),
    repo.listGroupAssignees(groupId),
  ]);
  return { task, attachments, comments, assignees };
}

export const createMyTask = asyncHandler(async (req: Request, res: Response) => {
  const input = createSelfTaskSchema.parse(req.body);
  const startDate = input.startDate ?? todayDateString();
  const dueDate = input.dueDate ?? startDate;
  const task = await repo.createSelfTask({
    employeeId: req.user!.id,
    title: input.title,
    description: input.description ?? null,
    priority: input.priority,
    startDate,
    dueDate,
    expectedDurationDays: input.expectedDurationDays,
  });
  res.status(201).json({ task });
});

export const updateMyTask = asyncHandler(async (req: Request, res: Response) => {
  const input = updateMyTaskSchema.parse(req.body);
  if (!input.status && input.progressRemarks === undefined) {
    throw ApiError.badRequest("Nothing to update");
  }
  const task = await repo.updateMyTask(req.params.id, req.user!.id, {
    status: input.status,
    progressRemarks: input.progressRemarks,
  });
  if (!task) throw ApiError.notFound("Task not found");

  if (input.status && task.assigned_by && task.assigned_by !== req.user!.id) {
    await notificationsRepo.createNotification({
      employeeId: task.assigned_by,
      type: "task_updated",
      title: "Task status updated",
      body: `${task.employee_name ?? "An employee"} marked "${task.title}" as ${input.status.replace("_", " ")}`,
      linkPath: "/admin/tasks",
      entityId: task.id,
    });
  }

  res.json({ task });
});

export const deleteMyTask = asyncHandler(async (req: Request, res: Response) => {
  const deleted = await repo.deleteSelfTask(req.params.id, req.user!.id);
  if (!deleted) throw ApiError.forbidden("You can only delete tasks you created yourself");
  res.json({ message: "Task deleted" });
});

export const listMyTasks = asyncHandler(async (req: Request, res: Response) => {
  const query = listTasksQuerySchema.parse(req.query);
  const tasks = await repo.listMyTasks(req.user!.id, {
    status: query.status,
    overdue: query.overdue === "true",
    sort: query.sort,
  });
  res.json({ tasks });
});

export const getMyTaskDetail = asyncHandler(async (req: Request, res: Response) => {
  const task = await repo.findTaskForEmployee(req.params.id, req.user!.id);
  if (!task) throw ApiError.notFound("Task not found");
  const detail = await enrichTaskForEmployee(task, req.user!.id);
  const extensions = await repo.listMyExtensionRequests(task.id, req.user!.id);
  res.json({ ...detail, extensions });
});

export const getMyAnalytics = asyncHandler(async (req: Request, res: Response) => {
  const analytics = await repo.getTaskAnalytics({ employeeId: req.user!.id });
  res.json({ analytics });
});

export const getMyCalendar = asyncHandler(async (req: Request, res: Response) => {
  const query = calendarQuerySchema.parse(req.query);
  const tasks = await repo.listCalendarTasks({
    employeeId: req.user!.id,
    from: query.from,
    to: query.to,
  });
  res.json({ tasks });
});

export const requestExtension = asyncHandler(async (req: Request, res: Response) => {
  const input = extensionRequestSchema.parse(req.body);
  const task = await repo.findTaskForEmployee(req.params.id, req.user!.id);
  if (!task) throw ApiError.notFound("Task not found");
  if (task.status === "completed") throw ApiError.badRequest("Completed tasks cannot be extended");

  const request = await repo.createExtensionRequest({
    taskId: task.id,
    requestedDueDate: input.requestedDueDate,
    reason: input.reason,
  });

  const adminResult = await pool.query<{ id: string }>(
    "SELECT id FROM employees WHERE role = 'admin' AND is_active = true AND deleted_at IS NULL"
  );
  await notificationsRepo.createNotificationsForEmployees(
    adminResult.rows.map((r) => r.id),
    {
      type: "extension_requested",
      title: "Extension request submitted",
      body: `${task.title} — ${input.reason.slice(0, 80)}`,
      linkPath: "/admin/tasks",
      entityId: task.id,
    }
  );

  res.status(201).json({ request });
});

export const adminAssignTask = asyncHandler(async (req: Request, res: Response) => {
  const raw = { ...req.body } as Record<string, unknown>;
  if (typeof raw.employeeIds === "string") {
    raw.employeeIds = JSON.parse(raw.employeeIds);
  }
  if (typeof raw.expectedDurationDays === "string") {
    raw.expectedDurationDays = parseInt(raw.expectedDurationDays, 10);
  }
  if (raw.siteId === "") raw.siteId = null;
  const input = adminAssignTaskSchema.parse(raw);
  if (input.dueDate < input.startDate) {
    throw ApiError.badRequest("Due date must be on or after the start date");
  }

  const { groupId, tasks } = await repo.assignTaskGroup({
    employeeIds: input.employeeIds,
    assignedBy: req.user!.id,
    title: input.title,
    description: input.description ?? null,
    priority: input.priority,
    siteId: input.siteId ?? null,
    startDate: input.startDate,
    dueDate: input.dueDate,
    expectedDurationDays: input.expectedDurationDays,
  });

  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  for (const file of files) {
    const { relativePath } = await storage.save(
      file.buffer,
      file.originalname,
      `task-files/${groupId}`
    );
    await repo.addAttachment({
      taskGroupId: groupId,
      filePath: relativePath,
      fileName: file.originalname,
      mimeType: file.mimetype,
      fileSize: file.size,
      uploadedBy: req.user!.id,
    });
  }

  await notificationsRepo.createNotificationsForEmployees(input.employeeIds, {
    type: "task_assigned",
    title: "New task assigned",
    body: input.title,
    linkPath: "/tasks",
    entityId: groupId,
  });

  await logAudit(req, "task.assign", "task", groupId, {
    employeeIds: input.employeeIds,
    title: input.title,
  });

  res.status(201).json({ groupId, tasks });
});

async function enrichGroup(group: repo.TaskGroupSummary) {
  const [attachments, comments] = await Promise.all([
    repo.listAttachments(group.group_id),
    repo.listComments(group.group_id),
  ]);
  return { group, attachments, comments, assignees: group.assignees };
}

export const adminListTaskGroups = asyncHandler(async (req: Request, res: Response) => {
  const query = listTasksQuerySchema.parse(req.query);
  const groups = await repo.adminListTaskGroups({
    employeeId: query.employeeId,
    status: query.status,
    overdue: query.overdue === "true",
    groupId: query.groupId,
    sort: query.sort,
  });
  res.json({ groups });
});

export const adminGetGroupDetail = asyncHandler(async (req: Request, res: Response) => {
  const { groupId } = groupIdParamSchema.parse({ groupId: req.params.groupId });
  const group = await repo.findTaskGroup(groupId);
  if (!group) throw ApiError.notFound("Task not found");
  const detail = await enrichGroup(group);
  const taskIds = group.assignees.map((assignee) => assignee.task_id);
  const extensions = (await repo.listExtensionRequests()).filter((extension) =>
    taskIds.includes(extension.task_id)
  );
  res.json({ ...detail, extensions });
});

export const adminUpdateTaskGroup = asyncHandler(async (req: Request, res: Response) => {
  const { groupId } = groupIdParamSchema.parse({ groupId: req.params.groupId });
  const raw = { ...req.body } as Record<string, unknown>;
  if (typeof raw.employeeIds === "string") {
    raw.employeeIds = JSON.parse(raw.employeeIds);
  }
  if (typeof raw.expectedDurationDays === "string") {
    raw.expectedDurationDays = parseInt(raw.expectedDurationDays, 10);
  }
  if (raw.siteId === "") raw.siteId = null;
  const input = adminUpdateTaskGroupSchema.parse(raw);
  if (input.dueDate < input.startDate) {
    throw ApiError.badRequest("Due date must be on or after the start date");
  }

  const existing = await repo.findTaskGroup(groupId);
  if (!existing) throw ApiError.notFound("Task not found");

  const result = await repo.adminUpdateTaskGroup(groupId, {
    assignedBy: req.user!.id,
    employeeIds: input.employeeIds,
    title: input.title,
    description: input.description ?? null,
    priority: input.priority,
    siteId: input.siteId ?? null,
    startDate: input.startDate,
    dueDate: input.dueDate,
    expectedDurationDays: input.expectedDurationDays,
  });

  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  for (const file of files) {
    const { relativePath } = await storage.save(
      file.buffer,
      file.originalname,
      `task-files/${groupId}`
    );
    await repo.addAttachment({
      taskGroupId: groupId,
      filePath: relativePath,
      fileName: file.originalname,
      mimeType: file.mimetype,
      fileSize: file.size,
      uploadedBy: req.user!.id,
    });
  }

  const previousIds = new Set(existing.assignees.map((assignee) => assignee.employee_id));
  const retainedIds = input.employeeIds.filter((id) => previousIds.has(id));
  if (retainedIds.length > 0) {
    await notificationsRepo.createNotificationsForEmployees(retainedIds, {
      type: "task_updated",
      title: "Task updated",
      body: input.title,
      linkPath: "/tasks",
      entityId: groupId,
    });
  }
  if (result.addedEmployeeIds.length > 0) {
    await notificationsRepo.createNotificationsForEmployees(result.addedEmployeeIds, {
      type: "task_assigned",
      title: "New task assigned",
      body: input.title,
      linkPath: "/tasks",
      entityId: groupId,
    });
  }

  await logAudit(req, "task.update", "task", groupId, {
    title: input.title,
    addedEmployeeIds: result.addedEmployeeIds,
    removedEmployeeIds: result.removedEmployeeIds,
  });

  const group = await repo.findTaskGroup(groupId);
  res.json({ group });
});

export const adminDeleteTaskGroup = asyncHandler(async (req: Request, res: Response) => {
  const { groupId } = groupIdParamSchema.parse({ groupId: req.params.groupId });
  const result = await repo.adminDeleteTaskGroup(groupId);
  if (result.deletedCount === 0) throw ApiError.notFound("Task not found");

  for (const filePath of result.attachmentPaths) {
    await storage.remove(filePath).catch(() => undefined);
  }

  await logAudit(req, "task.delete", "task", groupId, {
    deletedCount: result.deletedCount,
    title: result.title,
  });

  res.json({
    message: "Task deleted",
    deletedCount: result.deletedCount,
  });
});

export const adminListTasks = asyncHandler(async (req: Request, res: Response) => {
  const query = listTasksQuerySchema.parse(req.query);
  const tasks = await repo.adminListTasks({
    employeeId: query.employeeId,
    status: query.status,
    overdue: query.overdue === "true",
    groupId: query.groupId,
    sort: query.sort,
  });
  res.json({ tasks });
});

export const adminGetTaskDetail = asyncHandler(async (req: Request, res: Response) => {
  const task = await repo.findTaskById(req.params.id);
  if (!task) throw ApiError.notFound("Task not found");
  const groupId = task.group_id ?? task.id;
  const group = await repo.findTaskGroup(groupId);
  if (!group) throw ApiError.notFound("Task not found");
  const detail = await enrichGroup(group);
  const taskIds = group.assignees.map((assignee) => assignee.task_id);
  const extensions = (await repo.listExtensionRequests()).filter((extension) =>
    taskIds.includes(extension.task_id)
  );
  res.json({ ...detail, extensions });
});

export const adminGetAnalytics = asyncHandler(async (req: Request, res: Response) => {
  const analytics = await repo.getTaskAnalytics();
  res.json({ analytics });
});

export const adminGetCalendar = asyncHandler(async (req: Request, res: Response) => {
  const query = calendarQuerySchema.parse(req.query);
  const groups = await repo.listCalendarTaskGroups({
    employeeId: query.employeeId,
    from: query.from,
    to: query.to,
  });
  res.json({ groups });
});

export const adminDeleteTask = asyncHandler(async (req: Request, res: Response) => {
  const result = await repo.adminDeleteTask(req.params.id);
  if (result.deletedCount === 0) throw ApiError.notFound("Task not found");

  for (const filePath of result.attachmentPaths) {
    await storage.remove(filePath).catch(() => undefined);
  }

  await logAudit(req, "task.delete", "task", result.groupId ?? req.params.id, {
    deletedCount: result.deletedCount,
    title: result.title,
  });

  res.json({
    message: "Task deleted",
    deletedCount: result.deletedCount,
  });
});

export const adminClearAllTasks = asyncHandler(async (req: Request, res: Response) => {
  const result = await repo.adminClearAllTasks();

  for (const filePath of result.attachmentPaths) {
    await storage.remove(filePath).catch(() => undefined);
  }

  await logAudit(req, "task.clear_all", "task", undefined, {
    deletedCount: result.deletedCount,
  });

  res.json({
    message: "All tasks cleared",
    deletedCount: result.deletedCount,
  });
});

export const addTaskAttachments = asyncHandler(async (req: Request, res: Response) => {
  const task = await repo.findTaskById(req.params.id);
  if (!task) throw ApiError.notFound("Task not found");
  const groupId = task.group_id ?? task.id;
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (files.length === 0) throw ApiError.badRequest("No files uploaded");

  const attachments = [];
  for (const file of files) {
    const { relativePath } = await storage.save(file.buffer, file.originalname, `task-files/${groupId}`);
    attachments.push(
      await repo.addAttachment({
        taskGroupId: groupId,
        filePath: relativePath,
        fileName: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
        uploadedBy: req.user!.id,
      })
    );
  }
  res.status(201).json({ attachments });
});

export const addTaskGroupComment = asyncHandler(async (req: Request, res: Response) => {
  const { groupId } = groupIdParamSchema.parse({ groupId: req.params.groupId });
  const group = await repo.findTaskGroup(groupId);
  if (!group) throw ApiError.notFound("Task not found");
  const input = addCommentSchema.parse(req.body);

  const comment = await repo.addComment({
    taskGroupId: groupId,
    authorId: req.user!.id,
    body: input.body,
  });
  if (group.assignees[0]) {
    await repo.touchTaskActivity(group.assignees[0].task_id);
  }

  await notificationsRepo.createNotificationsForEmployees(
    group.assignees.map((assignee) => assignee.employee_id).filter((id) => id !== req.user!.id),
    {
      type: "task_comment",
      title: "New task comment",
      body: group.title,
      linkPath: "/tasks",
      entityId: group.assignees[0]?.task_id ?? groupId,
    }
  );

  res.status(201).json({ comment });
});

export const addTaskComment = asyncHandler(async (req: Request, res: Response) => {
  const input = addCommentSchema.parse(req.body);
  const isAdmin = req.user!.role === "admin";
  const task = isAdmin
    ? await repo.findTaskById(req.params.id)
    : await repo.findTaskForEmployee(req.params.id, req.user!.id);
  if (!task) throw ApiError.notFound("Task not found");
  const groupId = task.group_id ?? task.id;

  const comment = await repo.addComment({
    taskGroupId: groupId,
    authorId: req.user!.id,
    body: input.body,
  });
  await repo.touchTaskActivity(task.id);

  const notifyIds =
    req.user!.role === "admin"
      ? (await repo.listGroupAssignees(groupId)).map((a) => a.employee_id)
      : task.assigned_by
        ? [task.assigned_by]
        : [];

  await notificationsRepo.createNotificationsForEmployees(
    notifyIds.filter((id) => id !== req.user!.id),
    {
      type: "task_comment",
      title: "New task comment",
      body: task.title,
      linkPath: req.user!.role === "admin" ? "/tasks" : "/admin/tasks",
      entityId: task.id,
    }
  );

  res.status(201).json({ comment });
});

export const listPendingExtensions = asyncHandler(async (_req: Request, res: Response) => {
  const requests = await repo.listExtensionRequests({ status: "pending" });
  res.json({ requests });
});

export const reviewExtension = asyncHandler(async (req: Request, res: Response) => {
  const input = reviewExtensionSchema.parse(req.body);
  const request = await repo.reviewExtensionRequest({
    id: req.params.id,
    reviewerId: req.user!.id,
    status: input.status,
    adminRemarks: input.adminRemarks ?? null,
  });
  if (!request) throw ApiError.notFound("Extension request not found or already reviewed");

  const task = await repo.findTaskById(request.task_id);
  if (task) {
    await notificationsRepo.createNotification({
      employeeId: task.employee_id,
      type: "extension_reviewed",
      title: input.status === "approved" ? "Extension approved" : "Extension rejected",
      body: task.title,
      linkPath: "/tasks",
      entityId: task.id,
    });
  }

  res.json({ request });
});

export const downloadAttachment = asyncHandler(async (req: Request, res: Response) => {
  const attachment = await repo.findAttachment(req.params.attachmentId);
  if (!attachment) throw ApiError.notFound("Attachment not found");

  const allowed = await repo.canAccessTaskGroup(
    attachment.task_group_id,
    req.user!.id,
    req.user!.role === "admin"
  );
  if (!allowed) throw ApiError.forbidden("You do not have permission to view this file");

  const buffer = await storage.read(attachment.file_path);
  if (!buffer) throw ApiError.notFound("File not found");

  res.setHeader("Content-Type", attachment.mime_type);
  res.setHeader("Content-Disposition", `inline; filename="${attachment.file_name}"`);
  res.send(buffer);
});
