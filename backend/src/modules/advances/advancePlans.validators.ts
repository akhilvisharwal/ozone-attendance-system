import { z } from "zod";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

/** Mirrors the base ledger's bound so plan principals and loose entries behave the same. */
const amount = z.coerce
  .number()
  .positive("Amount must be greater than zero")
  .max(10_000_000, "Amount is too large");

export const planType = z.enum(["equal_installments", "custom"]);

export const createPlanSchema = z
  .object({
    employeeId: z.string().uuid(),
    principalAmount: amount,
    startDate: dateString,
    planType,
    installmentCount: z.coerce.number().int().min(1).max(60).optional(),
    installments: z.array(amount).min(1).max(60).optional(),
    note: z.string().trim().max(1000).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.planType === "equal_installments" && !data.installmentCount) {
      ctx.addIssue({
        code: "custom",
        message: "installmentCount is required for an equal-installments plan",
        path: ["installmentCount"],
      });
    }
    if (data.planType === "custom") {
      if (!data.installments || data.installments.length === 0) {
        ctx.addIssue({
          code: "custom",
          message: "installments is required for a custom plan",
          path: ["installments"],
        });
        return;
      }
      const sum = Math.round(data.installments.reduce((s, a) => s + a, 0) * 100) / 100;
      const principal = Math.round(data.principalAmount * 100) / 100;
      if (sum !== principal) {
        ctx.addIssue({
          code: "custom",
          message: `Installments must sum to ${principal.toFixed(2)}, got ${sum.toFixed(2)}`,
          path: ["installments"],
        });
      }
    }
  });

/** All fields optional — same "at least one" shape as advanceUpdateSchema. */
export const updatePlanSchema = z
  .object({
    principalAmount: amount.optional(),
    planType: planType.optional(),
    installmentCount: z.coerce.number().int().min(1).max(60).optional(),
    installments: z.array(amount).min(1).max(60).optional(),
    note: z.string().trim().max(1000).optional().nullable(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update",
  });

export const recordRepaymentSchema = z.object({
  installmentId: z.string().uuid(),
  amount,
  entryDate: dateString,
  note: z.string().trim().max(1000).optional().nullable(),
});

export const planListQuerySchema = z.object({
  employeeId: z.string().uuid().optional(),
});
