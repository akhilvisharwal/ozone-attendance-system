import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/errors";
import { createTaskSchema, updateTaskStatusSchema, adminUpdateTaskSchema, listTasksQuerySchema } from "./tasks.validators";
import * as repo from "./tasks.repository";
import { logAudit } from "../audit/audit.repository";
import { todayDateString } from "../../utils/date";

/** Employee creates a task for themselves (self-assign). */
export const createMyTask = asyncHandler(async (req: Request, res: Response) => {
  const input = createTaskSchema.parse(req.body);
  const task = await repo.createTask({
    employeeId: req.user!.id,
    assignedBy: req.user!.id,
    attendanceDate: input.attendanceDate ?? todayDateString(),
    title: input.title,
    description: input.description ?? null,
    priority: input.priority,
  });
  res.status(201).json({ task });
});

/** Employee updates the status of their own task. */
export const updateMyTaskStatus = asyncHandler(async (req: Request, res: Response) => {
  const { status } = updateTaskStatusSchema.parse(req.body);
  const task = await repo.updateTaskStatus(req.params.id, req.user!.id, status);
  if (!task) throw ApiError.notFound("Task not found");
  res.json({ task });
});

/** Employee deletes a task they created themselves (not admin-assigned). */
export const deleteMyTask = asyncHandler(async (req: Request, res: Response) => {
  const deleted = await repo.deleteTask(req.params.id, req.user!.id);
  if (!deleted) throw ApiError.forbidden("You can only delete tasks you created yourself");
  res.json({ message: "Task deleted" });
});

/** Employee lists their own tasks (optionally filtered by date/status). */
export const listMyTasks = asyncHandler(async (req: Request, res: Response) => {
  const query = listTasksQuerySchema.parse(req.query);
  const tasks = await repo.listMyTasks(req.user!.id, { date: query.date, status: query.status });
  res.json({ tasks });
});

/** Admin assigns a task to a specific employee. */
export const adminCreateTask = asyncHandler(async (req: Request, res: Response) => {
  const input = createTaskSchema.parse(req.body);
  if (!input.employeeId) throw ApiError.badRequest("employeeId is required when admin creates a task");

  const task = await repo.createTask({
    employeeId: input.employeeId,
    assignedBy: req.user!.id,
    attendanceDate: input.attendanceDate ?? todayDateString(),
    title: input.title,
    description: input.description ?? null,
    priority: input.priority,
  });
  await logAudit(req, "task.assign", "task", task.id, { employeeId: input.employeeId });
  res.status(201).json({ task });
});

/** Admin lists all tasks with optional filters. */
export const adminListTasks = asyncHandler(async (req: Request, res: Response) => {
  const query = listTasksQuerySchema.parse(req.query);
  const tasks = await repo.adminListTasks({ employeeId: query.employeeId, date: query.date, status: query.status });
  res.json({ tasks });
});

/** Admin edits any task (status, details, reassign date). */
export const adminUpdateTask = asyncHandler(async (req: Request, res: Response) => {
  const input = adminUpdateTaskSchema.parse(req.body);
  const task = await repo.adminUpdateTask(req.params.id, {
    ...input,
    description: input.description ?? undefined,
    attendanceDate: input.attendanceDate ?? undefined,
  });
  if (!task) throw ApiError.notFound("Task not found");
  res.json({ task });
});
