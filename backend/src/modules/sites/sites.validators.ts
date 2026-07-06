import { z } from "zod";

export const createSiteSchema = z.object({
  name: z.string().min(2).max(150),
  type: z.enum(["office", "project"]).default("project"),
  address: z.string().max(500).optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  radiusMeters: z.number().int().min(20).max(5000).optional().nullable(),
});

export const updateSiteSchema = createSiteSchema.partial().extend({
  isActive: z.boolean().optional(),
});
