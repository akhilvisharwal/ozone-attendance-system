import { Request, Response } from "express";
import path from "path";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/errors";
import { storage } from "../../services/storage";
import { getEmployeePermissions } from "../employees/employees.repository";
import { hasPermission } from "../auth/permissions";

const EXT_TO_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

async function canAccessFile(req: Request, relativePath: string): Promise<boolean> {
  const segments = relativePath.split("/");
  if (segments.length < 2 || relativePath.includes("..")) return false;

  const category = segments[0];
  const ownerCode = segments[1];
  const isOwner = req.user!.employeeCode === ownerCode;
  if (isOwner) return true;
  if (req.user!.role === "admin") return true;

  if (req.user!.role !== "junior_admin") return false;

  const perms = await getEmployeePermissions(req.user!.id);
  if (
    (category === "selfies" || category === "site-photos") &&
    hasPermission(perms, "viewAttendance")
  ) {
    return true;
  }
  if (category === "avatars" && hasPermission(perms, "viewEmployees")) {
    return true;
  }
  if (category === "expense-receipts" && hasPermission(perms, "manageExpenses")) {
    return true;
  }

  return false;
}

/**
 * Serves uploaded files with server-side access control:
 * Master Admin may view any file; employees may view files under their own code folder;
 * Junior Admins may view attendance photos, employee photos, and expense receipts when permitted.
 */
export const getFile = asyncHandler(async (req: Request, res: Response) => {
  const relativePath = (req.params[0] as string) ?? "";

  if (!(await canAccessFile(req, relativePath))) {
    throw ApiError.forbidden("You do not have permission to view this file");
  }

  const buffer = await storage.read(relativePath);
  if (!buffer) throw ApiError.notFound("File not found");

  const ext = path.extname(relativePath).toLowerCase();
  const contentType = EXT_TO_MIME[ext] ?? "application/octet-stream";
  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "private, max-age=86400");
  if (ext === ".pdf") {
    res.setHeader("Content-Disposition", `inline; filename="${path.basename(relativePath)}"`);
  }
  res.send(buffer);
});
