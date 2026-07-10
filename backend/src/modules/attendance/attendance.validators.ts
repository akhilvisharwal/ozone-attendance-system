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
  workSummary: z.string().max(4000).optional(),
  workStatus: workStatusEnum,
  remarks: z.string().max(2000).optional(),
  deviceInfo: z.string().max(500).optional(),
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
  format: z.enum(["excel", "pdf"]).optional(),
});

export const adminListQuerySchema = z
  .object({
    employeeId: z.string().uuid().optional(),
    from: z.string().date().optional(),
    to: z.string().date().optional(),
    status: z
      .enum(["present", "half_day", "absent", "pending", "checked_in", "checked_out"])
      .optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(20),
  })
  .refine((data) => !data.from || !data.to || data.from <= data.to, {
    message: "The From date must be on or before the To date.",
    path: ["to"],
  });

const timeStringSchema = z.string().regex(/^\d{2}:\d{2}$/, "Use HH:mm format");

export const manualAttendanceSchema = z
  .object({
    employeeId: z.string().uuid(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    status: z.enum([
      "present",
      "half_day",
      "absent",
      "leave",
      "holiday",
      "weekly_off",
      "holiday_worked",
      "weekly_off_worked",
      "not_applicable",
    ]),
    reason: z.string().trim().min(1, "Reason is required").max(500),
    approvedById: z.string().uuid().optional(),
    checkInTime: timeStringSchema.optional().nullable(),
    checkOutTime: timeStringSchema.optional().nullable(),
    totalMinutes: z.coerce.number().int().min(0).max(24 * 60).optional().nullable(),
    override: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    const needsTimes =
      value.status === "present" ||
      value.status === "half_day" ||
      value.status === "holiday_worked" ||
      value.status === "weekly_off_worked";
    if (needsTimes) {
      if (!value.checkInTime) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Check-in time is required", path: ["checkInTime"] });
      }
      if (!value.checkOutTime) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Check-out time is required", path: ["checkOutTime"] });
      }
    }
  });

export const manualAttendanceDeleteSchema = z.object({
  employeeId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
