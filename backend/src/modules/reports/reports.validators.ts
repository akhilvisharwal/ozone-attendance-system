import { z } from "zod";

export const exportReportQuerySchema = z.object({
  format: z.enum(["excel", "pdf"]).optional(),
  period: z.enum(["daily", "weekly", "monthly", "custom"]).default("custom"),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  employeeId: z.string().uuid().optional(),
});

export const viewReportQuerySchema = z.object({
  period: z.enum(["daily", "weekly", "monthly", "custom"]).default("monthly"),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  employeeId: z.string().uuid().optional(),
});
