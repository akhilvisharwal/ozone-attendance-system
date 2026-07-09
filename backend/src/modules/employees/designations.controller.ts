import { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/errors";
import { logAudit } from "../audit/audit.repository";
import { getSettings, updateCategory } from "../settings/settings.cache";
import * as repo from "./designations.repository";

const nameSchema = z
  .string()
  .trim()
  .min(2, "Role name must be at least 2 characters")
  .max(100, "Role name must be at most 100 characters");

const createDesignationSchema = z.object({ name: nameSchema });
const updateDesignationSchema = z.object({ name: nameSchema });

export const listDesignations = asyncHandler(async (_req: Request, res: Response) => {
  const items = await repo.listDesignations();
  const defaultDesignationId = getSettings().employee.defaultDesignationId ?? null;
  res.json({ items, total: items.length, defaultDesignationId });
});

export const createDesignation = asyncHandler(async (req: Request, res: Response) => {
  const { name } = createDesignationSchema.parse(req.body);
  const existing = await repo.findDesignationByName(name);
  if (existing) {
    throw ApiError.conflict(`A role named "${existing.name}" already exists`);
  }

  try {
    const designation = await repo.createDesignation(name, req.user!.id);
    await logAudit(req, "employee.designation_create", "employee_designation", designation.id, {
      name: designation.name,
    });
    res.status(201).json({ designation });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "23505") {
      throw ApiError.conflict("A role with this name already exists");
    }
    throw err;
  }
});

export const updateDesignation = asyncHandler(async (req: Request, res: Response) => {
  const existing = await repo.findDesignationById(req.params.id);
  if (!existing) throw ApiError.notFound("Role not found");

  const { name } = updateDesignationSchema.parse(req.body);
  const duplicate = await repo.findDesignationByName(name);
  if (duplicate && duplicate.id !== existing.id) {
    throw ApiError.conflict(`A role named "${duplicate.name}" already exists`);
  }

  try {
    const designation = await repo.updateDesignation(existing.id, name);
    if (!designation) throw ApiError.notFound("Role not found");
    await logAudit(req, "employee.designation_update", "employee_designation", designation.id, {
      previousName: existing.name,
      name: designation.name,
    });
    res.json({ designation });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "23505") {
      throw ApiError.conflict("A role with this name already exists");
    }
    throw err;
  }
});

export const deleteDesignation = asyncHandler(async (req: Request, res: Response) => {
  const existing = await repo.findDesignationById(req.params.id);
  if (!existing) throw ApiError.notFound("Role not found");

  const inUse = await repo.countEmployeesWithDesignation(existing.id);
  if (inUse > 0) {
    throw ApiError.conflict(
      `Cannot delete "${existing.name}" — it is assigned to ${inUse} employee${inUse === 1 ? "" : "s"}`
    );
  }

  const deleted = await repo.deleteDesignation(existing.id);
  if (!deleted) throw ApiError.conflict("Role could not be deleted");

  // Clear settings default if it pointed at the deleted role.
  const employeeSettings = getSettings().employee;
  if (employeeSettings.defaultDesignationId === existing.id) {
    await updateCategory(
      "employee",
      { ...employeeSettings, defaultDesignationId: null },
      req.user!.id
    );
  }

  await logAudit(req, "employee.designation_delete", "employee_designation", existing.id, {
    name: existing.name,
  });
  res.json({ success: true });
});
