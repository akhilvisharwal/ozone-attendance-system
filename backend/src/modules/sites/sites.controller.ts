import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/errors";
import { createSiteSchema, updateSiteSchema } from "./sites.validators";
import * as repo from "./sites.repository";
import { logAudit } from "../audit/audit.repository";
import { storage } from "../../services/storage";

export const createSite = asyncHandler(async (req: Request, res: Response) => {
  const input = createSiteSchema.parse(req.body);
  const site = await repo.createSite({ ...input, createdBy: req.user!.id });
  await logAudit(req, "site.create", "site", site.id, { name: site.name });
  res.status(201).json({ site });
});

export const listSites = asyncHandler(async (req: Request, res: Response) => {
  const includeInactive = req.user!.role === "admin" && req.query.includeInactive === "true";
  const sites = await repo.listSites(includeInactive);
  res.json({ items: sites });
});

export const updateSite = asyncHandler(async (req: Request, res: Response) => {
  const input = updateSiteSchema.parse(req.body);
  const site = await repo.updateSite(req.params.id, input);
  if (!site) throw ApiError.notFound("Site not found");
  await logAudit(req, "site.update", "site", site.id, input);
  res.json({ site });
});

export const updateSiteImage = asyncHandler(async (req: Request, res: Response) => {
  const existing = await repo.findSiteById(req.params.id);
  if (!existing) throw ApiError.notFound("Site not found");

  const file = req.file;
  if (!file) throw ApiError.badRequest("Please upload a site image");

  const { relativePath } = await storage.save(file.buffer, file.originalname, `site-images/${existing.id}`);
  if (existing.image_path) await storage.remove(existing.image_path);

  const site = await repo.updateSiteImage(existing.id, relativePath);
  await logAudit(req, "site.update_image", "site", existing.id);
  res.json({ site });
});

export const deleteSiteImage = asyncHandler(async (req: Request, res: Response) => {
  const existing = await repo.findSiteById(req.params.id);
  if (!existing) throw ApiError.notFound("Site not found");

  if (existing.image_path) await storage.remove(existing.image_path);
  const site = await repo.updateSiteImage(existing.id, null);
  await logAudit(req, "site.delete_image", "site", existing.id);
  res.json({ site });
});

export const getSiteDependencies = asyncHandler(async (req: Request, res: Response) => {
  const existing = await repo.findSiteById(req.params.id);
  if (!existing) throw ApiError.notFound("Site not found");

  const attendance = await repo.countSiteAttendance(existing.id);
  res.json({ dependencies: { attendance } });
});

export const deleteSite = asyncHandler(async (req: Request, res: Response) => {
  const existing = await repo.findSiteById(req.params.id);
  if (!existing) throw ApiError.notFound("Site not found");

  // A site referenced by attendance records cannot be removed — deactivating it
  // keeps historical reports intact while hiding it from future check-outs.
  const attendance = await repo.countSiteAttendance(existing.id);
  if (attendance > 0) {
    throw ApiError.conflict(
      `This site is linked to ${attendance} attendance record${attendance === 1 ? "" : "s"} and cannot be deleted. Deactivate it instead.`
    );
  }

  if (existing.image_path) await storage.remove(existing.image_path);
  const site = await repo.softDeleteSite(existing.id);
  if (!site) throw ApiError.notFound("Site not found");

  await logAudit(req, "site.delete", "site", existing.id, { name: existing.name });
  res.json({ site });
});
