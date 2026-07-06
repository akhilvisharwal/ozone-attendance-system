import { z } from "zod";

export const loginSchema = z.object({
  employeeId: z.string().min(3).max(20),
  password: z.string().min(1).max(200),
});
