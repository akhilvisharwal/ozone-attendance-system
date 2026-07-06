import { z } from "zod";
import { getSettings } from "../settings/settings.cache";

export function buildCreateLeaveSchema() {
  const leave = getSettings().leave;
  const durationOptions = leave.halfDayAllowed ? (["full", "half"] as const) : (["full"] as const);

  return z.object({
    leaveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
    leaveType: z.enum(durationOptions).default("full"),
    leaveCategory: z
      .string()
      .min(1)
      .refine((v) => leave.leaveTypes.some((t) => t.toLowerCase() === v.toLowerCase()), {
        message: "Invalid leave category",
      }),
    reason: z.string().min(10, "Please provide a reason (min 10 characters)").max(1000),
  });
}

export const reviewLeaveSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  reviewNote: z.string().max(500).optional(),
});

export const adminListLeavesQuerySchema = z.object({
  status:     z.enum(["pending", "approved", "rejected"]).optional(),
  employeeId: z.string().uuid().optional(),
  page:  z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const myLeavesQuerySchema = z.object({
  page:  z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

/** @deprecated use buildCreateLeaveSchema() for runtime validation */
export const createLeaveSchema = z.object({
  leaveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  leaveType: z.enum(["full", "half"]).default("full"),
  leaveCategory: z.string().min(1).default("Annual"),
  reason: z.string().min(10, "Please provide a reason (min 10 characters)").max(1000),
});
