import { Request, Response } from "express";
import fs from "fs";
import path from "path";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/errors";
import { normalizeAttendanceSettings } from "../../utils/settingsHelpers";
import { normalizeLeaveSettings } from "../../utils/leaveSettings";
import { getEnabledLeaveCategories } from "../../utils/leaveSettings";
import { logAudit } from "../audit/audit.repository";
import { getSettings, refreshSettingsCache, updateCategory } from "./settings.cache";
import type { AttendanceSettings } from "./settings.types";
import * as repo from "./settings.repository";
import {
  auditQuerySchema,
  categoryParamSchema,
  changePasswordSchema,
  parseCategorySettings,
} from "./settings.validators";
import { pool } from "../../config/db";
import bcrypt from "bcryptjs";

export const getAllSettings = asyncHandler(async (_req: Request, res: Response) => {
  res.json({ settings: getSettings() });
});

/** Public subset for authenticated users (mobile rules, company branding, policies). */
export const getPublicSettings = asyncHandler(async (_req: Request, res: Response) => {
  const s = getSettings();
  res.json({
    company: {
      name: s.company.name,
      logoPath: s.company.logoPath,
      timeFormat: s.company.timeFormat,
      timezone: s.company.timezone,
      dateFormat: s.company.dateFormat,
    },
    mobile: s.mobile,
    appearance: {
      theme: s.appearance.theme,
      accentColor: s.appearance.accentColor,
      sidebarCollapsed: s.appearance.sidebarCollapsed,
    },
    leave: {
      categories: getEnabledLeaveCategories(s.leave).map((cat) => ({
        name: cat.name,
        yearlyLimit: cat.yearlyLimit,
      })),
      halfDayAllowed: s.leave.halfDayAllowed,
      approvalRequired: s.leave.approvalRequired,
    },
    weeklyOff: { defaultWeeklyOffDays: s.weeklyOff.defaultWeeklyOffDays },
    employee: {
      idFormat: s.employee.idFormat,
      profilePhotoRequired: s.employee.profilePhotoRequired,
    },
    attendance: {
      allowManualOverride: s.attendance.allowManualOverride,
      minHoursPresent: s.attendance.minHoursPresent,
      minHoursHalfDay: s.attendance.minHoursHalfDay,
    },
    reports: { defaultFormat: s.reports.defaultFormat },
  });
});

export const updateSettings = asyncHandler(async (req: Request, res: Response) => {
  const category = categoryParamSchema.parse(req.params.category);
  const raw = parseCategorySettings(category, req.body);
  const parsed =
    category === "attendance"
      ? normalizeAttendanceSettings(raw as AttendanceSettings)
      : category === "leave"
        ? normalizeLeaveSettings(raw)
        : raw;
  const previous = getSettings()[category];
  const settings = await updateCategory(category, parsed as never, req.user!.id);
  await logAudit(req, "settings.update", "settings", undefined, {
    category,
    previous,
    next: parsed,
  });
  res.json({ settings, category: settings[category] });
});

export const exportData = asyncHandler(async (req: Request, res: Response) => {
  const data = await repo.exportAllData();
  await logAudit(req, "settings.export_data", "settings");
  res.json({ exportedAt: new Date().toISOString(), data });
});

export const uploadCompanyLogo = asyncHandler(async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) throw ApiError.badRequest("Logo file is required");

  const ext = path.extname(file.originalname) || ".png";
  const brandingDir = path.join(process.cwd(), "..", "branding");
  const assetsDir = path.join(process.cwd(), "assets");
  fs.mkdirSync(brandingDir, { recursive: true });
  fs.mkdirSync(assetsDir, { recursive: true });

  const logoName = `logo${ext}`;
  const brandingPath = path.join(brandingDir, logoName);
  const assetsPath = path.join(assetsDir, logoName);
  fs.writeFileSync(brandingPath, file.buffer);
  fs.writeFileSync(assetsPath, file.buffer);

  const publicPath = path.join(process.cwd(), "..", "frontend", "public", logoName);
  try {
    fs.writeFileSync(publicPath, file.buffer);
  } catch {
    // optional in production layouts
  }

  const company = { ...getSettings().company, logoPath: `assets/${logoName}` };
  await updateCategory("company", company, req.user!.id);
  await logAudit(req, "settings.logo_upload", "settings", undefined, { logoPath: company.logoPath });
  res.json({ settings: getSettings(), logoPath: company.logoPath });
});

export const changeAdminPassword = asyncHandler(async (req: Request, res: Response) => {
  const input = changePasswordSchema.parse(req.body);
  const result = await pool.query<{ password_hash: string }>(
    `SELECT password_hash FROM employees WHERE id = $1`,
    [req.user!.id]
  );
  const row = result.rows[0];
  if (!row) throw ApiError.notFound("User not found");

  const ok = await bcrypt.compare(input.currentPassword, row.password_hash);
  if (!ok) throw ApiError.unauthorized("Current password is incorrect");

  const security = getSettings().security;
  if (input.newPassword.length < security.passwordMinLength) {
    throw ApiError.badRequest(`Password must be at least ${security.passwordMinLength} characters`);
  }
  if (security.requireUppercase && !/[A-Z]/.test(input.newPassword)) {
    throw ApiError.badRequest("Password must contain an uppercase letter");
  }
  if (security.requireNumbers && !/\d/.test(input.newPassword)) {
    throw ApiError.badRequest("Password must contain a number");
  }

  const hash = await bcrypt.hash(input.newPassword, 12);
  await pool.query(`UPDATE employees SET password_hash = $1, must_change_password = false WHERE id = $2`, [
    hash,
    req.user!.id,
  ]);
  await logAudit(req, "auth.password_change", "employee", req.user!.id);
  res.json({ success: true });
});

export const listAuditLogs = asyncHandler(async (req: Request, res: Response) => {
  const q = auditQuerySchema.parse(req.query);
  const offset = (q.page - 1) * q.limit;
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (q.action) {
    conditions.push(`a.action ILIKE $${idx++}`);
    params.push(`%${q.action}%`);
  }
  if (q.from) {
    conditions.push(`a.created_at >= $${idx++}::date`);
    params.push(q.from);
  }
  if (q.to) {
    conditions.push(`a.created_at < ($${idx++}::date + interval '1 day')`);
    params.push(q.to);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const countRes = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM audit_logs a ${where}`,
    params
  );

  params.push(q.limit, offset);
  const rows = await pool.query(
    `SELECT a.id, a.action, a.target_type, a.target_id, a.metadata, a.ip_address, a.created_at,
            e.name AS actor_name, e.employee_code AS actor_code
     FROM audit_logs a
     LEFT JOIN employees e ON e.id = a.actor_id
     ${where}
     ORDER BY a.created_at DESC
     LIMIT $${idx++} OFFSET $${idx}`,
    params
  );

  res.json({
    logs: rows.rows,
    total: parseInt(countRes.rows[0]?.count ?? "0", 10),
    page: q.page,
    limit: q.limit,
  });
});

export const refreshSettings = asyncHandler(async (_req: Request, res: Response) => {
  const settings = await refreshSettingsCache();
  res.json({ settings });
});
