import { z } from "zod";

export const createTaskSchema = z.object({
  employeeId: z.string().uuid().optional(), // admin sets this; employees use their own id
  attendanceDate: z.string().date().optional().nullable(),
  title: z.string().min(2).max(200),
  description: z.string().max(2000).optional().nullable(),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
});

export const updateTaskStatusSchema = z.object({
  status: z.enum(["pending", "in_progress", "completed", "cancelled"]),
});

export const adminUpdateTaskSchema = z.object({
  title: z.string().min(2).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  status: z.enum(["pending", "in_progress", "completed", "cancelled"]).optional(),
  attendanceDate: z.string().date().optional().nullable(),
  employeeId: z.string().uuid().optional(),
});

export const listTasksQuerySchema = z.object({
  date: z.string().date().optional(),
  status: z.enum(["pending", "in_progress", "completed", "cancelled"]).optional(),
  employeeId: z.string().uuid().optional(),
});
