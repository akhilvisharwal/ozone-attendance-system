import { z } from "zod";

export const expenseCreateSchema = z.object({
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  amount: z.coerce.number().positive("Amount must be greater than zero").max(10_000_000),
  paymentMethod: z.string().min(1).max(40),
  category: z.string().min(1).max(40),
  description: z.string().trim().max(2000).optional().nullable(),
});

export const expenseUpdateSchema = expenseCreateSchema.partial();

export const expenseReviewSchema = z
  .object({
    status: z.enum(["approved", "rejected"]),
    remarks: z.string().trim().max(1000).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.status === "rejected" && !data.remarks?.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "Rejection reason is required",
        path: ["remarks"],
      });
    }
  });

export const requestExpenseReviewSchema = expenseReviewSchema;

export const expenseWeekPaidSchema = z.object({
  employeeId: z.string().uuid(),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export const expenseListQuerySchema = z.object({
  employeeId: z.string().uuid().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(["draft", "pending", "approved", "rejected", "paid", "archived"]).optional(),
  view: z.enum(["drafts", "pending", "history", "all"]).optional(),
});

export const reimbursementSubmitSchema = z.object({
  periodType: z.enum(["weekly", "monthly", "custom"]),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const requestListQuerySchema = z.object({
  employeeId: z.string().uuid().optional(),
  status: z
    .enum(["pending_approval", "approved", "rejected", "paid", "archived"])
    .optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const requestReviewSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  remarks: z.string().trim().max(1000).optional().nullable(),
});

export const requestPaidSchema = z.object({
  notes: z.string().trim().max(1000).optional().nullable(),
});

export const expenseExportQuerySchema = z
  .object({
    format: z.enum(["pdf", "excel"]).default("pdf"),
    period: z.enum(["weekly", "monthly", "custom"]).default("monthly"),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    employeeId: z.string().uuid().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.period === "custom" && (!data.from || !data.to)) {
      ctx.addIssue({
        code: "custom",
        message: "Custom period requires both from and to dates",
        path: ["from"],
      });
    }
    if (data.period === "custom" && data.from && data.to && data.from > data.to) {
      ctx.addIssue({
        code: "custom",
        message: "Period start must be on or before period end",
        path: ["to"],
      });
    }
  });
