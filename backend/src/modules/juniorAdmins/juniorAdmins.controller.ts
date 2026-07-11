import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/errors";
import { generateTemporaryPassword } from "../../utils/employeeCode";
import { validatePasswordPolicy } from "../../utils/settingsHelpers";
import { logAudit } from "../audit/audit.repository";
import { revokeAllRefreshTokens } from "../auth/auth.repository";
import { updateEmployeePassword, findEmployeeByCode } from "../employees/employees.repository";
import {
  createJuniorAdminSchema,
  deleteJuniorAdminSchema,
  resetJuniorAdminPasswordSchema,
  updateJuniorAdminSchema,
} from "./juniorAdmins.validators";
import * as repo from "./juniorAdmins.repository";
import { notifyAdminEvent } from "../../services/email/adminNotifications";
import { requireVerifiedOtp } from "../emailVerification/emailVerification.service";
import { notifySecurityAlert } from "../notifications/securityNotifications";

export const listJuniorAdmins = asyncHandler(async (_req: Request, res: Response) => {
  const items = await repo.listJuniorAdmins();
  res.json({ items });
});

export const getJuniorAdmin = asyncHandler(async (req: Request, res: Response) => {
  const item = await repo.findJuniorAdminById(req.params.id);
  if (!item) throw ApiError.notFound("Junior Admin not found");
  res.json({ employee: item });
});

export const createJuniorAdmin = asyncHandler(async (req: Request, res: Response) => {
  const input = createJuniorAdminSchema.parse(req.body);

  await requireVerifiedOtp({
    req,
    purpose: "junior_admin_create",
    otpChallengeId: input.otpChallengeId,
    otpCode: input.otpCode,
  });

  const employeeCode = (input.employeeCode ?? (await repo.nextJuniorAdminCode())).toUpperCase();

  const existing = await findEmployeeByCode(employeeCode);
  if (existing) throw ApiError.conflict(`Employee ID ${employeeCode} is already in use`);

  const temporaryPassword = input.password?.trim() || generateTemporaryPassword();
  const policyError = validatePasswordPolicy(temporaryPassword);
  if (policyError) throw ApiError.badRequest(policyError);

  const passwordHash = await bcrypt.hash(temporaryPassword, 12);
  const permissions = repo.normalizePermissions(
    input.permissions ?? repo.defaultJuniorAdminPermissions()
  );

  const employee = await repo.createJuniorAdmin({
    employeeCode,
    name: input.name,
    email: input.email ?? null,
    phone: input.phone ?? null,
    passwordHash,
    createdBy: req.user!.id,
    permissions,
    isActive: input.isActive ?? true,
  });

  await logAudit(req, "junior_admin.create", "employee", employee.id, {
    employeeCode,
    name: employee.name,
    permissions,
    verifiedByEmailOtp: true,
  });

  void notifyAdminEvent({
    req,
    subject: `New Junior Admin created: ${employeeCode}`,
    title: "New Junior Admin account created",
    lines: [
      `Employee ID: ${employeeCode}`,
      `Name: ${employee.name}`,
      `Created by: ${req.user!.employeeCode}`,
    ],
    targetType: "employee",
    targetId: employee.id,
    metadata: { employeeCode, role: "junior_admin" },
  });

  void notifySecurityAlert({
    type: "security_junior_admin_created",
    title: "Junior Admin created",
    body: `${employee.name} (${employeeCode}) was created by ${req.user!.employeeCode}.`,
    linkPath: "/admin/settings",
    entityId: employee.id,
  });

  res.status(201).json({
    employee,
    credentials: {
      employeeId: employeeCode,
      temporaryPassword,
    },
  });
});

export const updateJuniorAdmin = asyncHandler(async (req: Request, res: Response) => {
  const input = updateJuniorAdminSchema.parse(req.body);
  const before = await repo.findJuniorAdminById(req.params.id);
  if (!before) throw ApiError.notFound("Junior Admin not found");

  const employee = await repo.updateJuniorAdmin(req.params.id, {
    name: input.name,
    email: input.email,
    phone: input.phone,
    permissions: input.permissions ? repo.normalizePermissions(input.permissions) : undefined,
    isActive: input.isActive,
  });
  if (!employee) throw ApiError.notFound("Junior Admin not found");

  if (input.isActive === false || (input.permissions && JSON.stringify(input.permissions) !== JSON.stringify(before.admin_permissions))) {
    await revokeAllRefreshTokens(employee.id);
  }

  await logAudit(req, "junior_admin.update", "employee", employee.id, {
    employeeCode: employee.employee_code,
    before: {
      name: before.name,
      email: before.email,
      phone: before.phone,
      is_active: before.is_active,
      permissions: before.admin_permissions,
    },
    after: {
      name: employee.name,
      email: employee.email,
      phone: employee.phone,
      is_active: employee.is_active,
      permissions: employee.admin_permissions,
    },
  });

  res.json({ employee });
});

export const setJuniorAdminActive = asyncHandler(async (req: Request, res: Response) => {
  const isActive = Boolean(req.body?.isActive);
  const employee = await repo.setJuniorAdminActive(req.params.id, isActive);
  if (!employee) throw ApiError.notFound("Junior Admin not found");

  if (!isActive) {
    await revokeAllRefreshTokens(employee.id);
  }

  await logAudit(
    req,
    isActive ? "junior_admin.activate" : "junior_admin.deactivate",
    "employee",
    employee.id,
    { employeeCode: employee.employee_code, isActive }
  );

  res.json({ employee });
});

export const resetJuniorAdminPassword = asyncHandler(async (req: Request, res: Response) => {
  const input = resetJuniorAdminPasswordSchema.parse(req.body ?? {});
  const existing = await repo.findJuniorAdminById(req.params.id);
  if (!existing) throw ApiError.notFound("Junior Admin not found");

  const temporaryPassword = input.password?.trim() || generateTemporaryPassword();
  const policyError = validatePasswordPolicy(temporaryPassword);
  if (policyError) throw ApiError.badRequest(policyError);

  const passwordHash = await bcrypt.hash(temporaryPassword, 12);
  await updateEmployeePassword(existing.id, passwordHash, { markFirstLoginComplete: true });
  await revokeAllRefreshTokens(existing.id);

  await logAudit(req, "junior_admin.reset_password", "employee", existing.id, {
    employeeCode: existing.employee_code,
  });

  const updated = await repo.findJuniorAdminById(existing.id);

  res.json({
    employee: updated ?? existing,
    credentials: {
      employeeId: existing.employee_code,
      temporaryPassword,
    },
  });
});

export const deleteJuniorAdmin = asyncHandler(async (req: Request, res: Response) => {
  const input = deleteJuniorAdminSchema.parse(req.body ?? {});

  await requireVerifiedOtp({
    req,
    purpose: "junior_admin_delete",
    otpChallengeId: input.otpChallengeId,
    otpCode: input.otpCode,
  });

  const employee = await repo.softDeleteJuniorAdmin(req.params.id);
  if (!employee) throw ApiError.notFound("Junior Admin not found");

  await revokeAllRefreshTokens(employee.id);
  await logAudit(req, "junior_admin.delete", "employee", employee.id, {
    employeeCode: employee.employee_code,
    name: employee.name,
    verifiedByEmailOtp: true,
  });

  void notifySecurityAlert({
    type: "security_junior_admin_deleted",
    title: "Junior Admin deleted",
    body: `${employee.name} (${employee.employee_code}) was deleted by ${req.user!.employeeCode}.`,
    linkPath: "/admin/settings",
    entityId: employee.id,
  });

  res.json({ employee, message: "Junior Admin deleted" });
});
