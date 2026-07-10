import { z } from "zod";
import { ADMIN_PERMISSION_KEYS } from "../auth/permissions";

const permissionsSchema = z.object(
  Object.fromEntries(ADMIN_PERMISSION_KEYS.map((key) => [key, z.boolean()])) as Record<
    (typeof ADMIN_PERMISSION_KEYS)[number],
    z.ZodBoolean
  >
);

export const createJuniorAdminSchema = z.object({
  name: z.string().trim().min(2).max(150),
  employeeCode: z
    .string()
    .trim()
    .min(2)
    .max(20)
    .transform((v) => v.toUpperCase())
    .optional(),
  email: z.string().trim().email().max(150).optional().nullable(),
  phone: z.string().trim().max(20).optional().nullable(),
  password: z.string().min(6).max(128).optional(),
  permissions: permissionsSchema.optional(),
  isActive: z.boolean().optional(),
  mustChangePassword: z.boolean().optional(),
});

export const updateJuniorAdminSchema = z.object({
  name: z.string().trim().min(2).max(150).optional(),
  email: z.string().trim().email().max(150).optional().nullable(),
  phone: z.string().trim().max(20).optional().nullable(),
  permissions: permissionsSchema.optional(),
  isActive: z.boolean().optional(),
  mustChangePassword: z.boolean().optional(),
});

export const resetJuniorAdminPasswordSchema = z.object({
  password: z.string().min(6).max(128).optional(),
  mustChangePassword: z.boolean().optional(),
});
