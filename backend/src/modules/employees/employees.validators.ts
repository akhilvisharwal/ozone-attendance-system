import { z } from "zod";

export const createEmployeeSchema = z.object({
  name: z.string().min(2).max(150),
  email: z.string().email().optional().nullable(),
  phone: z.string().min(6).max(20).optional().nullable(),
  department: z.string().max(100).optional().nullable(),
});

export const updateEmployeeSchema = z.object({
  name: z.string().min(2).max(150).optional(),
  email: z.string().email().optional().nullable(),
  phone: z.string().min(6).max(20).optional().nullable(),
  department: z.string().max(100).optional().nullable(),
});

export const setActiveSchema = z.object({
  isActive: z.boolean(),
});

export const resetPasswordSchema = z.object({
  // When provided, the admin sets this exact password. When omitted, a random
  // temporary password is generated instead.
  newPassword: z
    .string()
    .min(6, "Password must be at least 6 characters")
    .max(100, "Password is too long")
    .optional(),
  // Force the employee to change the password at next login. Defaults to true
  // for generated passwords and false when the admin sets one explicitly.
  requireChange: z.boolean().optional(),
});

export const weeklyOffSchema = z.object({
  // 0 = Sunday .. 6 = Saturday. Empty array means the employee has no weekly off.
  weeklyOffDays: z
    .array(z.number().int().min(0, "Invalid weekday").max(6, "Invalid weekday"))
    .max(7, "Too many days"),
});

export const listEmployeesQuerySchema = z.object({
  search: z.string().optional(),
  isActive: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
