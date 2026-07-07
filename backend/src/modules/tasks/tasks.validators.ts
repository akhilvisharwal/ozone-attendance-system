import { z } from "zod";

export const taskStatusEnum = z.enum(["not_started", "in_progress", "on_hold", "completed"]);

export const adminAssignTaskSchema = z.object({
  employeeIds: z.array(z.string().uuid()).min(1),
  title: z.string().min(2).max(200),
  description: z.string().max(5000).optional().nullable(),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  siteId: z.string().uuid().optional().nullable(),
  startDate: z.string().date(),
  dueDate: z.string().date(),
  expectedDurationDays: z.number().int().min(1).max(365).default(1),
});

export const createSelfTaskSchema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(5000).optional().nullable(),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  startDate: z.string().date().optional(),
  dueDate: z.string().date().optional(),
  expectedDurationDays: z.number().int().min(1).max(365).default(1),
});

export const updateMyTaskSchema = z.object({
  status: taskStatusEnum.optional(),
  progressRemarks: z.string().max(5000).optional().nullable(),
});

export const listTasksQuerySchema = z.object({
  status: taskStatusEnum.optional(),
  employeeId: z.string().uuid().optional(),
  overdue: z.enum(["true", "false"]).optional(),
  groupId: z.string().uuid().optional(),
  sort: z.enum(["newest", "oldest"]).default("newest"),
});

export const calendarQuerySchema = z.object({
  from: z.string().date(),
  to: z.string().date(),
  employeeId: z.string().uuid().optional(),
});

export const addCommentSchema = z.object({
  body: z.string().min(1).max(2000),
});

export const extensionRequestSchema = z.object({
  requestedDueDate: z.string().date(),
  reason: z.string().min(5).max(2000),
});

export const adminUpdateTaskGroupSchema = adminAssignTaskSchema;

export const groupIdParamSchema = z.object({
  groupId: z.string().uuid(),
});

export const reviewExtensionSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  adminRemarks: z.string().max(2000).optional().nullable(),
});
