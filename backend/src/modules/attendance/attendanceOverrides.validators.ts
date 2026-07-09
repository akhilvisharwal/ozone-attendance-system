import { z } from "zod";

const hhmm = z.string().regex(/^\d{2}:\d{2}$/);

function validateOverrideRules(
  value: {
    officeStartTime?: string | null;
    lateCheckInTime?: string | null;
    halfDayCutoff?: string | null;
    officeClosingTime?: string | null;
    minHoursPresent?: number | null;
    minHoursHalfDay?: number | null;
  },
  ctx: z.RefinementCtx
) {
  const present = value.minHoursPresent;
  const half = value.minHoursHalfDay;
  if (present != null && half != null && half >= present) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Minimum hours for half day must be less than minimum hours for present",
      path: ["minHoursHalfDay"],
    });
  }

  const start = value.officeStartTime;
  const late = value.lateCheckInTime;
  const cutoff = value.halfDayCutoff;
  const closing = value.officeClosingTime;

  if (start && late && start > late) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Late check-in time must be at or after office start time",
      path: ["lateCheckInTime"],
    });
  }
  if (late && cutoff && late > cutoff) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Half-day cutoff must be at or after late check-in time",
      path: ["halfDayCutoff"],
    });
  }
  if (cutoff && closing && cutoff > closing) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Office closing time must be at or after half-day cutoff",
      path: ["officeClosingTime"],
    });
  }
}

function hasAtLeastOneRule(value: {
  officeStartTime?: string | null;
  lateCheckInTime?: string | null;
  halfDayCutoff?: string | null;
  officeClosingTime?: string | null;
  minHoursPresent?: number | null;
  minHoursHalfDay?: number | null;
}): boolean {
  return (
    value.officeStartTime != null ||
    value.lateCheckInTime != null ||
    value.halfDayCutoff != null ||
    value.officeClosingTime != null ||
    value.minHoursPresent != null ||
    value.minHoursHalfDay != null
  );
}

const overrideBodySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().trim().min(1).max(200),
  applyToAll: z.boolean().default(true),
  employeeIds: z.array(z.string().uuid()).default([]),
  officeStartTime: hhmm.nullable().optional(),
  lateCheckInTime: hhmm.nullable().optional(),
  halfDayCutoff: hhmm.nullable().optional(),
  officeClosingTime: hhmm.nullable().optional(),
  minHoursPresent: z.number().min(1).max(24).nullable().optional(),
  minHoursHalfDay: z.number().min(0.5).max(12).nullable().optional(),
});

export const createAttendanceOverrideSchema = overrideBodySchema.superRefine((value, ctx) => {
  if (value.startDate > value.endDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "End date must be on or after start date",
      path: ["endDate"],
    });
  }
  if (!hasAtLeastOneRule(value)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "At least one attendance rule must be customized for the override",
      path: ["officeStartTime"],
    });
  }
  if (!value.applyToAll && value.employeeIds.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Select at least one employee or apply to all employees",
      path: ["employeeIds"],
    });
  }
  validateOverrideRules(value, ctx);
});

export const updateAttendanceOverrideSchema = createAttendanceOverrideSchema;

export const setOverrideEnabledSchema = z.object({
  isEnabled: z.boolean(),
});

export const overrideDateQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  employeeId: z.string().uuid().optional(),
});
