import { Request, Response } from "express";
import path from "path";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/errors";
import { storage } from "../../services/storage";

const EXT_TO_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

/**
 * Serves uploaded selfies / site photos with server-side access control:
 * admins may view any file; employees may only view files stored under
 * their own employee code folder (selfies/<code>/... or site-photos/<code>/...).
 * This prevents access simply by guessing or editing URLs.
 */
export const getFile = asyncHandler(async (req: Request, res: Response) => {
  const relativePath = (req.params[0] as string) ?? "";
  const segments = relativePath.split("/");

  if (segments.length < 2 || relativePath.includes("..")) {
    throw ApiError.badRequest("Invalid file path");
  }

  const ownerCode = segments[1];
  const isOwner = req.user!.employeeCode === ownerCode;
  const isAdmin = req.user!.role === "admin";

  if (!isOwner && !isAdmin) {
    throw ApiError.forbidden("You do not have permission to view this file");
  }

  const buffer = await storage.read(relativePath);
  if (!buffer) throw ApiError.notFound("File not found");

  const ext = path.extname(relativePath).toLowerCase();
  res.setHeader("Content-Type", EXT_TO_MIME[ext] ?? "application/octet-stream");
  res.setHeader("Cache-Control", "private, max-age=86400");
  res.send(buffer);
});
