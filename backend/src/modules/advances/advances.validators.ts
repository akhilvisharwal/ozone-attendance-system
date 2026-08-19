import { z } from "zod";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

/** Amount bound mirrors the expenses module so both money features behave the same. */
const amount = z.coerce
  .number()
  .positive("Amount must be greater than zero")
  .max(10_000_000, "Amount is too large");

export const advanceEntryType = z.enum(["taken", "returned"]);

export const advanceCreateSchema = z.object({
  employeeId: z.string().uuid(),
  entryDate: dateString,
  amount,
  entryType: advanceEntryType,
  note: z.string().trim().max(1000).optional().nullable(),
});

/** employeeId is immutable — move an entry by deleting and re-adding it. */
export const advanceUpdateSchema = z
  .object({
    entryDate: dateString.optional(),
    amount: amount.optional(),
    entryType: advanceEntryType.optional(),
    note: z.string().trim().max(1000).optional().nullable(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update",
  });

export const advanceListQuerySchema = z.object({
  employeeId: z.string().uuid().optional(),
  from: dateString.optional(),
  to: dateString.optional(),
  entryType: advanceEntryType.optional(),
});

/** Month in YYYY-MM form, matching the Monthly Attendance query convention. */
export const advanceMonthQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "Use YYYY-MM").optional(),
});

export const advanceOtpRequestSchema = z.object({
  action: z.enum(["create", "edit", "delete"]),
  employeeId: z.string().uuid(),
});
