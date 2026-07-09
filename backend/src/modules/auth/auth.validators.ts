import { z } from "zod";

export const loginSchema = z.object({
  employeeId: z.string().min(3).max(20),
  password: z.string().min(1).max(200),
});

export const employeeChangePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(6).max(128),
});
