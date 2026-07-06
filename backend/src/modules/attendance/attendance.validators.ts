import { z } from "zod";

const workStatusEnum = z.enum(
  ["completed", "in_progress", "pending", "on_hold", "cancelled"],
  { errorMap: () => ({ message: "Please select a valid work status" }) }
);

export const checkInSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  accuracy: z.coerce.number().min(0).max(10000).optional(),
  siteId: z.string().uuid({ message: "Please select a project/site" }),
  workSummary: z.string().max(4000).optional(),
  workStatus: workStatusEnum.optional(),
  deviceInfo: z.string().max(500).optional(),
});

export const checkOutSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  accuracy: z.coerce.number().min(0).max(10000).optional(),
  workSummary: z.string().min(5, "Please describe the work completed (at least 5 characters)").max(4000),
  workStatus: workStatusEnum,
  remarks: z.string().max(2000).optional(),
});

export const myHistoryQuerySchema = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const monthlyQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "Month must be in YYYY-MM format").optional(),
  employeeId: z.string().uuid().optional(),
  siteId: z.string().uuid().optional(),
});

export const monthlyExportQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "Month must be in YYYY-MM format").optional(),
  employeeId: z.string().uuid().optional(),
  siteId: z.string().uuid().optional(),
  format: z.enum(["excel", "csv", "pdf"]).optional(),
});

export const adminListQuerySchema = z.object({
  employeeId: z.string().uuid().optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  status: z.enum(["checked_in", "checked_out"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
});
