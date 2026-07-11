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
import { otpFieldsSchema } from "../emailVerification/emailVerification.validators";
import { requireVerifiedOtp } from "../emailVerification/emailVerification.service";
import * as repo from "./employees.repository";
import * as designationsRepo from "./designations.repository";
import { getSettings } from "../settings/settings.cache";
import { validatePasswordPolicy, resolveEmployeeRoleFromSettings } from "../../utils/settingsHelpers";
import { logAudit } from "../audit/audit.repository";
import { storage } from "../../services/storage";
import { notifyAdminEvent } from "../../services/email/adminNotifications";
import { processProfilePhoto } from "../../utils/profilePhoto";
import { normalizeEmployeeName } from "../../utils/chronologicalSort";

async function assertUniqueEmployeeName(name: string, excludeId?: string): Promise<string> {
  const normalized = normalizeEmployeeName(name);
  if (normalized.length < 2) {
    throw ApiError.badRequest("Full name must be at least 2 characters");
  }
  const existing = await repo.findEmployeeByNormalizedName(normalized, excludeId);
  if (existing) {
    throw ApiError.conflict(
      `An employee named "${existing.name}" already exists (${existing.employee_code}). Full names must be unique.`
    );
  }
  return normalized;
}

export const createEmployee = asyncHandler(async (req: Request, res: Response) => {
  const input = createEmployeeSchema.parse(req.body);
  const empSettings = getSettings().employee;
  const weeklyOff = getSettings().weeklyOff.defaultWeeklyOffDays;
  const uniqueName = await assertUniqueEmployeeName(input.name);

  const designationId = input.designationId ?? empSettings.defaultDesignationId ?? null;
  if (!designationId) {
    throw ApiError.badRequest(
      "Select a Role / Designation, or set a default role in Settings → Employees"
    );
  }

  const designation = await designationsRepo.findDesignationById(designationId);
  if (!designation) throw ApiError.badRequest("Selected Role / Designation was not found");

  // Always create a regular employee account from this panel. Auth role stays employee.
  const role = resolveEmployeeRoleFromSettings();

  let employee: Awaited<ReturnType<typeof repo.createEmployee>> | null = null;
  let employeeCode = "";
  let temporaryPassword = "";
  let lastError: unknown;

  // Retry once if two admins race on the same next code.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      employeeCode = await generateNextEmployeeCode();
      temporaryPassword = generateTemporaryPassword();
      const passwordHash = await bcrypt.hash(temporaryPassword, 12);

      employee = await repo.createEmployee({
        employeeCode,
        name: uniqueName,
        email: input.email ?? null,
        phone: input.phone ?? null,
        passwordHash,
        role,
        createdBy: req.user!.id,
        designationId: designation.id,
        department: input.department ?? null,
        weeklyOffDays: weeklyOff,
        usesDefaultWeeklyOff: true,
        firstLoginCompleted: !empSettings.requirePasswordChange,
        isActive: empSettings.activeByDefault,
      });
      lastError = null;
      break;
    } catch (err) {
      lastError = err;
      const code = (err as { code?: string })?.code;
      if (code === "23505") {
        const constraint = (err as { constraint?: string })?.constraint ?? "";
        if (constraint.includes("unique_name") || /name/i.test(String((err as Error).message))) {
          throw ApiError.conflict(
            `An employee with the name "${uniqueName}" already exists. Full names must be unique.`
          );
        }
        // Retry employee_code collisions once.
        continue;
      }
      throw err;
    }
  }

  if (!employee) {
    throw lastError instanceof Error
      ? lastError
      : ApiError.conflict("Could not allocate a unique employee ID. Please try again.");
  }

  await logAudit(req, "employee.create", "employee", employee.id, {
    employeeCode,
    designation: designation.name,
    designationId: designation.id,
    idFormat: empSettings.idFormat,
    requirePasswordChange: empSettings.requirePasswordChange,
    activeByDefault: empSettings.activeByDefault,
  });

  void notifyAdminEvent({
    req,
    subject: `New employee created: ${employeeCode}`,
    title: "New employee account created",
    lines: [
      `Employee ID: ${employeeCode}`,
      `Name: ${employee.name}`,
      `Role / Designation: ${designation.name}`,
      `Created by: ${req.user!.employeeCode}`,
    ],
    targetType: "employee",
    targetId: employee.id,
    metadata: { employeeCode },
  });

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
    designationId: query.designationId,
    sort: query.sort,
    page: query.page,
    limit: query.limit,
  });

  res.json({ items, total, page: query.page, limit: query.limit, sort: query.sort });
});

export const listActiveEmployees = asyncHandler(async (req: Request, res: Response) => {
  const sort =
    req.query.sort === "newest" || req.query.sort === "oldest" ? req.query.sort : "oldest";
  const items = await repo.listActiveEmployees(sort);
  res.json({ items, total: items.length, sort });
});

export const getEmployee = asyncHandler(async (req: Request, res: Response) => {
  const employee = await repo.findEmployeeById(req.params.id);
  if (!employee || employee.role !== "employee") throw ApiError.notFound("Employee not found");
  res.json({ employee: repo.toPublicEmployee(employee) });
});

export const updateEmployee = asyncHandler(async (req: Request, res: Response) => {
  const input = updateEmployeeSchema.parse(req.body);

  if (input.designationId) {
    const designation = await designationsRepo.findDesignationById(input.designationId);
    if (!designation) throw ApiError.badRequest("Selected Role / Designation was not found");
  }

  let name = input.name;
  if (name !== undefined) {
    name = await assertUniqueEmployeeName(name, req.params.id);
  }

  try {
    const employee = await repo.updateEmployeeProfile(req.params.id, {
      name,
      email: input.email,
      phone: input.phone,
      department: input.department,
      designationId: input.designationId,
    });
    if (!employee) throw ApiError.notFound("Employee not found");

    await logAudit(req, "employee.update", "employee", employee.id, {
      ...input,
      name,
      designation: employee.designation ?? null,
    });
    res.json({ employee });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "23505") {
      throw ApiError.conflict(
        `An employee with the name "${name ?? input.name}" already exists. Full names must be unique.`
      );
    }
    throw err;
  }
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
    if (req.user!.role === "employee" && getSettings().employee.profilePhotoRequired) {
      throw ApiError.badRequest("A profile picture is required");
    }
    throw ApiError.badRequest("Please upload a profile picture");
  }

  const existing = await repo.findEmployeeById(req.user!.id);
  if (!existing) throw ApiError.notFound("User not found");

  const processed = await processProfilePhoto({
    buffer: file.buffer,
    mimetype: file.mimetype,
    originalName: file.originalname,
  });

  const { relativePath } = await storage.save(
    processed.buffer,
    processed.filename,
    `avatars/${req.user!.employeeCode}`
  );

  if (existing.profile_photo_path) {
    await storage.remove(existing.profile_photo_path);
  }

  const employee = await repo.updateProfilePhoto(req.user!.id, relativePath);
  if (!employee) throw ApiError.notFound("User not found");

  await logAudit(req, "employee.update_photo", "employee", employee.id, {
    self: true,
    role: employee.role,
  });

  res.json({ employee });
});

export const deleteMyAvatar = asyncHandler(async (req: Request, res: Response) => {
  const existing = await repo.findEmployeeById(req.user!.id);
  if (!existing) throw ApiError.notFound("User not found");

  if (req.user!.role === "employee" && getSettings().employee.profilePhotoRequired) {
    throw ApiError.badRequest("A profile picture is required and cannot be removed.");
  }

  if (existing.profile_photo_path) {
    await storage.remove(existing.profile_photo_path);
  }

  const employee = await repo.updateProfilePhoto(req.user!.id, null);
  await logAudit(req, "employee.delete_photo", "employee", req.user!.id, {
    self: true,
    role: existing.role,
  });

  res.json({ employee });
});

export const resetEmployeePassword = asyncHandler(async (req: Request, res: Response) => {
  const employee = await repo.findEmployeeById(req.params.id);
  if (!employee || employee.role !== "employee") throw ApiError.notFound("Employee not found");

  const { newPassword } = resetPasswordSchema.parse(req.body ?? {});

  // Admin either sets an explicit password or lets the system generate one.
  const isDirect = Boolean(newPassword);
  const password = newPassword ?? generateTemporaryPassword();

  if (isDirect) {
    const policyError = validatePasswordPolicy(password);
    if (policyError) throw ApiError.badRequest(policyError);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await repo.updateEmployeePassword(employee.id, passwordHash, { markFirstLoginComplete: true });

  const admin = await repo.findEmployeeById(req.user!.id);
  await logAudit(req, "employee.reset_password", "employee", employee.id, {
    direct: isDirect,
    employeeName: employee.name,
    employeeCode: employee.employee_code,
    adminName: admin?.name ?? null,
    adminCode: req.user!.employeeCode,
  });

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

  const processed = await processProfilePhoto({
    buffer: file.buffer,
    mimetype: file.mimetype,
    originalName: file.originalname,
  });

  const { relativePath } = await storage.save(
    processed.buffer,
    processed.filename,
    `avatars/${employee.employee_code}`
  );

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

  const { weeklyOffDays, useCompanyDefault } = weeklyOffSchema.parse(req.body ?? {});
  const updated = await repo.updateWeeklyOffDays(
    employee.id,
    weeklyOffDays,
    useCompanyDefault === true
  );
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
  const otp = otpFieldsSchema.parse(req.body ?? {});

  await requireVerifiedOtp({
    req,
    purpose: "employee_delete",
    otpChallengeId: otp.otpChallengeId,
    otpCode: otp.otpCode,
  });

  const employee = await repo.findEmployeeById(req.params.id);
  if (!employee || employee.role !== "employee") throw ApiError.notFound("Employee not found");

  const dependencies = await repo.countEmployeeDependencies(employee.id);
  const deleted = await repo.softDeleteEmployee(employee.id);
  if (!deleted) throw ApiError.notFound("Employee not found");

  await logAudit(req, "employee.delete", "employee", employee.id, {
    dependencies,
    verifiedByEmailOtp: true,
  });
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
