import { z } from "zod";

const holidayTypeEnum = z.enum(["one_time", "recurring"]);

export const createHolidaySchema = z
  .object({
    name: z.string().min(2, "Holiday name is required").max(150),
    description: z.string().max(500).optional().nullable(),
    holidayType: holidayTypeEnum.default("one_time"),
    holidayDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date").optional().nullable(),
    recurringMonth: z.coerce.number().int().min(1).max(12).optional().nullable(),
    recurringDay: z.coerce.number().int().min(1).max(31).optional().nullable(),
  })
  .superRefine((val, ctx) => {
    if (val.holidayType === "one_time") {
      if (!val.holidayDate) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Holiday date is required", path: ["holidayDate"] });
      }
    } else {
      if (!val.recurringMonth || !val.recurringDay) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Recurring month and day are required",
          path: ["recurringMonth"],
        });
      }
    }
  });

export const updateHolidaySchema = z
  .object({
    name: z.string().min(2).max(150).optional(),
    description: z.string().max(500).optional().nullable(),
    holidayType: holidayTypeEnum.optional(),
    holidayDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    recurringMonth: z.coerce.number().int().min(1).max(12).optional().nullable(),
    recurringDay: z.coerce.number().int().min(1).max(31).optional().nullable(),
  })
  .superRefine((val, ctx) => {
    if (val.holidayType === "one_time" && val.holidayDate === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Holiday date is required", path: ["holidayDate"] });
    }
    if (val.holidayType === "recurring" && (val.recurringMonth === null || val.recurringDay === null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Recurring month and day are required",
        path: ["recurringMonth"],
      });
    }
  });

export const listHolidaysQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const upcomingHolidaysQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(5),
});
