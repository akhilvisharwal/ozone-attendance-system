import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/errors";
import { generateNextEmployeeCode, generateTemporaryPassword } from "../../utils/employeeCode";
import {
  createEmployeeSchema,
  updateEmployeeSchema,
  setActiveSchema,
  listEmployeesQuerySchema,
  resetPasswordSchema,
  weeklyOffSchema,
} from "./employees.validators";
import * as repo from "./employees.repository";
import { getSettings } from "../settings/settings.cache";
import { validatePasswordPolicy } from "../../utils/settingsHelpers";
import { logAudit } from "../audit/audit.repository";
import { storage } from "../../services/storage";

export const createEmployee = asyncHandler(async (req: Request, res: Response) => {
  const input = createEmployeeSchema.parse(req.body);
  const empSettings = getSettings().employee;
  const weeklyOff = getSettings().weeklyOff.defaultWeeklyOffDays;

  const employeeCode = await generateNextEmployeeCode();
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, 12);

  const employee = await repo.createEmployee({
    employeeCode,
    name: input.name,
    email: input.email ?? null,
    phone: input.phone ?? null,
    passwordHash,
    role: empSettings.defaultRole,
    createdBy: req.user!.id,
    weeklyOffDays: weeklyOff,
    mustChangePassword: empSettings.requirePasswordChange,
  });

  await logAudit(req, "employee.create", "employee", employee.id, { employeeCode });

  res.status(201).json({
    employee,
    credentials: {
      employeeId: employeeCode,
      temporaryPassword,
    },
  });
});

export const listEmployees = asyncHandler(async (req: Request, res: Response) => {
  const query = listEmployeesQuerySchema.parse(req.query);

  const { items, total } = await repo.listEmployees({
    search: query.search,
    isActive: query.isActive === undefined ? undefined : query.isActive === "true",
    page: query.page,
    limit: query.limit,
  });

  res.json({ items, total, page: query.page, limit: query.limit });
});

export const getEmployee = asyncHandler(async (req: Request, res: Response) => {
  const employee = await repo.findEmployeeById(req.params.id);
  if (!employee || employee.role !== "employee") throw ApiError.notFound("Employee not found");
  res.json({ employee: repo.toPublicEmployee(employee) });
});

export const updateEmployee = asyncHandler(async (req: Request, res: Response) => {
  const input = updateEmployeeSchema.parse(req.body);
  const employee = await repo.updateEmployeeProfile(req.params.id, input);
  if (!employee) throw ApiError.notFound("Employee not found");

  await logAudit(req, "employee.update", "employee", employee.id, input);
  res.json({ employee });
});

export const setEmployeeActive = asyncHandler(async (req: Request, res: Response) => {
  const { isActive } = setActiveSchema.parse(req.body);
  const employee = await repo.setEmployeeActive(req.params.id, isActive);
  if (!employee) throw ApiError.notFound("Employee not found");

  await logAudit(req, isActive ? "employee.activate" : "employee.deactivate", "employee", employee.id);
  res.json({ employee });
});

export const updateMyAvatar = asyncHandler(async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) {
    if (getSettings().employee.profilePhotoRequired) {
      throw ApiError.badRequest("A profile picture is required");
    }
    throw ApiError.badRequest("Please upload a profile picture");
  }

  const { relativePath } = await storage.save(
    file.buffer,
    file.originalname,
    `avatars/${req.user!.employeeCode}`
  );

  const employee = await repo.updateProfilePhoto(req.user!.id, relativePath);
  if (!employee) throw ApiError.notFound("Employee not found");

  res.json({ employee });
});

export const resetEmployeePassword = asyncHandler(async (req: Request, res: Response) => {
  const employee = await repo.findEmployeeById(req.params.id);
  if (!employee || employee.role !== "employee") throw ApiError.notFound("Employee not found");

  const { newPassword, requireChange } = resetPasswordSchema.parse(req.body ?? {});

  // Admin either sets an explicit password or lets the system generate one.
  const isDirect = Boolean(newPassword);
  const password = newPassword ?? generateTemporaryPassword();
  const mustChangePassword = isDirect ? requireChange ?? false : getSettings().employee.requirePasswordChange;

  if (isDirect) {
    const policyError = validatePasswordPolicy(password);
    if (policyError) throw ApiError.badRequest(policyError);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await repo.updateEmployeePassword(employee.id, passwordHash, mustChangePassword);

  await logAudit(req, "employee.reset_password", "employee", employee.id, { direct: isDirect });

  res.json({
    message: isDirect ? "Password updated successfully" : "Password reset successfully",
    credentials: {
      employeeId: employee.employee_code,
      temporaryPassword: password,
    },
  });
});

export const adminUpdateEmployeeAvatar = asyncHandler(async (req: Request, res: Response) => {
  const employee = await repo.findEmployeeById(req.params.id);
  if (!employee || employee.role !== "employee") throw ApiError.notFound("Employee not found");

  const file = req.file;
  if (!file) throw ApiError.badRequest("Please upload a profile picture");

  const { relativePath } = await storage.save(
    file.buffer,
    file.originalname,
    `avatars/${employee.employee_code}`
  );

  // Remove the previous photo file so storage does not accumulate orphans.
  if (employee.profile_photo_path) {
    await storage.remove(employee.profile_photo_path);
  }

  const updated = await repo.updateProfilePhoto(employee.id, relativePath);
  await logAudit(req, "employee.update_photo", "employee", employee.id);

  res.json({ employee: updated });
});

export const updateWeeklyOff = asyncHandler(async (req: Request, res: Response) => {
  const employee = await repo.findEmployeeById(req.params.id);
  if (!employee || employee.role !== "employee") throw ApiError.notFound("Employee not found");

  const { weeklyOffDays } = weeklyOffSchema.parse(req.body ?? {});
  const updated = await repo.updateWeeklyOffDays(employee.id, weeklyOffDays);
  if (!updated) throw ApiError.notFound("Employee not found");

  await logAudit(req, "employee.update_weekly_off", "employee", employee.id, { weeklyOffDays });
  res.json({ employee: updated });
});

export const getEmployeeDependencies = asyncHandler(async (req: Request, res: Response) => {
  const employee = await repo.findEmployeeById(req.params.id);
  if (!employee || employee.role !== "employee") throw ApiError.notFound("Employee not found");

  const dependencies = await repo.countEmployeeDependencies(employee.id);
  res.json({ dependencies });
});

export const deleteEmployee = asyncHandler(async (req: Request, res: Response) => {
  const employee = await repo.findEmployeeById(req.params.id);
  if (!employee || employee.role !== "employee") throw ApiError.notFound("Employee not found");

  const dependencies = await repo.countEmployeeDependencies(employee.id);
  const deleted = await repo.softDeleteEmployee(employee.id);
  if (!deleted) throw ApiError.notFound("Employee not found");

  await logAudit(req, "employee.delete", "employee", employee.id, { dependencies });
  res.json({ employee: deleted, dependencies });
});

export const adminDeleteEmployeeAvatar = asyncHandler(async (req: Request, res: Response) => {
  const employee = await repo.findEmployeeById(req.params.id);
  if (!employee || employee.role !== "employee") throw ApiError.notFound("Employee not found");

  if (employee.profile_photo_path) {
    await storage.remove(employee.profile_photo_path);
  }

  const updated = await repo.updateProfilePhoto(employee.id, null);
  await logAudit(req, "employee.delete_photo", "employee", employee.id);

  res.json({ employee: updated });
});
