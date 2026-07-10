import { Request, Response } from "express";
import fs from "fs";
import path from "path";
import { env } from "../../config/env";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/errors";
import { normalizeAttendanceSettings, normalizeCompanySettings } from "../../utils/settingsHelpers";
import { validatePasswordPolicy } from "../../utils/settingsHelpers";
import { normalizeLeaveSettings } from "../../utils/leaveSettings";
import { getEnabledLeaveCategories } from "../../utils/leaveSettings";
import {
  clearAllAuditLogs,
  countAuditLogs,
  fetchAuditLogsForExport,
  getAuditLogById,
  listAuditLogs as listAuditLogsRepo,
  logAudit,
} from "../audit/audit.repository";
import { buildAuditLogsExcel, buildAuditLogsPdf } from "../audit/audit.export";
import {
  AUDIT_ACTION_TYPES,
  AUDIT_MODULES,
  AUDIT_RETENTION_DAYS,
} from "../audit/audit.catalog";
import { getSettings, refreshSettingsCache, updateCategory } from "./settings.cache";
import { normalizeBackupSettings, parseBackupPayload, type BackupExportType } from "../../utils/backupHelpers";
import type {
  AttendanceSettings,
  BackupSettings,
  CompanySettings,
  EmployeeSettings,
  WeeklyOffSettings,
} from "./settings.types";
import { getEffectiveAttendanceRules } from "../attendance/attendanceRules.service";
import { todayDateString } from "../../utils/date";
import { normalizeWeeklyOffDays } from "../../utils/weeklyOffDays";
import * as repo from "./settings.repository";
import * as backupService from "./settings.backup";
import { fetchReadableReportBundle } from "./settings.backupReportData";
import { buildReadableReportExcel } from "./settings.backupReportExcel";
import { findDesignationById } from "../employees/designations.repository";
import { buildReadableReportPdf } from "./settings.backupReportPdf";
import type { ReadableReportScope } from "./settings.backupReport.types";
import { getStorageBreakdown } from "./settings.storage";
import {
  CLEANUP_TARGETS,
  executeStorageCleanup,
  getCleanupCenterSummary,
} from "./settings.storageCleanup";
import {
  auditClearSchema,
  auditExportFormatSchema,
  auditQuerySchema,
  categoryParamSchema,
  changePasswordSchema,
  cleanupConfirmSchema,
  parseCategorySettings,
} from "./settings.validators";
import {
  migrateEmployeeIdPrefix,
  prefixesDiffer,
  type PrefixMigrationResult,
} from "../../utils/employeeIdPrefixMigration";
import { requireVerifiedOtp } from "../emailVerification/emailVerification.service";
import { pool } from "../../config/db";
import bcrypt from "bcryptjs";

export const getAllSettings = asyncHandler(async (_req: Request, res: Response) => {
  // Always read through the DB so the Settings UI shows the persisted prefix
  // even if another process updated app_settings.
  const settings = await refreshSettingsCache();
  res.json({ settings });
});

/** Public subset for authenticated users (mobile rules, company branding, policies). */
export const getPublicSettings = asyncHandler(async (req: Request, res: Response) => {
  const s = getSettings();
  const today = todayDateString();
  const employeeId = req.user!.role === "employee" ? req.user!.id : null;
  const { settings: effectiveAttendance, activeOverride } = await getEffectiveAttendanceRules(
    today,
    employeeId
  );
  res.json({
    company: {
      name: s.company.name,
      logoPath: s.company.logoPath,
      address: s.company.address,
      phone: s.company.phone,
      phoneCountryCode: s.company.phoneCountryCode,
      secondaryPhone: s.company.secondaryPhone,
      secondaryPhoneCountryCode: s.company.secondaryPhoneCountryCode,
      email: s.company.email,
      additionalEmails: s.company.additionalEmails ?? [],
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
    attendance: effectiveAttendance,
    attendanceOverride: activeOverride,
    reports: { defaultFormat: s.reports.defaultFormat },
    maps: {
      apiKey: env.googleMapsBrowserApiKey,
      configured: env.googleMapsBrowserApiKey.length > 0,
    },
    security: {
      sessionTimeoutMinutes: s.security.sessionTimeoutMinutes,
    },
  });
});

export const updateSettings = asyncHandler(async (req: Request, res: Response) => {
  const category = categoryParamSchema.parse(req.params.category);
  const body = req.body as Record<string, unknown>;
  const otpChallengeId =
    typeof body.otpChallengeId === "string" ? body.otpChallengeId : undefined;
  const otpCode = typeof body.otpCode === "string" ? body.otpCode : undefined;
  const { otpChallengeId: _a, otpCode: _b, ...settingsBody } = body;

  const raw = parseCategorySettings(category, settingsBody);
  const parsed =
    category === "attendance"
      ? normalizeAttendanceSettings(raw as AttendanceSettings)
      : category === "leave"
        ? normalizeLeaveSettings(raw)
        : category === "company"
          ? normalizeCompanySettings(raw as CompanySettings)
          : category === "weeklyOff"
            ? {
                defaultWeeklyOffDays: normalizeWeeklyOffDays(
                  (raw as WeeklyOffSettings).defaultWeeklyOffDays ?? []
                ),
              }
            : category === "backup"
              ? normalizeBackupSettings({
                  ...(getSettings().backup as BackupSettings),
                  ...(raw as BackupSettings),
                })
              : raw;

  // Always re-read from DB before comparing prefixes so a stale in-memory cache
  // cannot skip migration or overwrite a previously saved EMP### with OZN###.
  const freshSettings = await refreshSettingsCache();
  const previous = freshSettings[category];

  if (category === "company") {
    const prevCompany = previous as CompanySettings;
    const nextCompany = parsed as CompanySettings;
    const emailChanged =
      prevCompany.email.trim().toLowerCase() !== nextCompany.email.trim().toLowerCase();
    const phoneChanged =
      prevCompany.phone.trim() !== nextCompany.phone.trim() ||
      prevCompany.phoneCountryCode !== nextCompany.phoneCountryCode;

    if (emailChanged) {
      await requireVerifiedOtp({
        req,
        purpose: "company_email_change",
        otpChallengeId,
        otpCode,
      });
    } else if (phoneChanged) {
      await requireVerifiedOtp({
        req,
        purpose: "company_phone_change",
        otpChallengeId,
        otpCode,
      });
    }
  }

  let prefixMigration: PrefixMigrationResult | null = null;
  let settings;

  if (category === "employee") {
    const prevEmployee = previous as EmployeeSettings;
    const nextEmployee = parsed as EmployeeSettings;
    if (nextEmployee.defaultDesignationId) {
      const designation = await findDesignationById(nextEmployee.defaultDesignationId);
      if (!designation) {
        throw ApiError.badRequest("Default role was not found. Choose an existing employee role.");
      }
    }
    if (prefixesDiffer(prevEmployee.idFormat, nextEmployee.idFormat)) {
      try {
        // Persist settings in the same transaction as the ID rewrite so a
        // conflict/failure cannot leave codes migrated without saving EMP###.
        prefixMigration = await migrateEmployeeIdPrefix({
          previousIdFormat: prevEmployee.idFormat,
          newIdFormat: nextEmployee.idFormat,
          persistEmployeeSettings: nextEmployee,
          updatedBy: req.user!.id,
        });
        // Migration may rename 0 rows when codes already use the new prefix
        // (desynced settings). Settings are still persisted in that transaction.
        settings = await refreshSettingsCache();
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Failed to update existing employee IDs for the new prefix.";
        throw ApiError.badRequest(message);
      }
    } else {
      settings = await updateCategory(category, parsed as never, req.user!.id);
    }
  } else {
    settings = await updateCategory(category, parsed as never, req.user!.id);
  }

  const auditAction =
    category === "audit" ? "settings.audit_retention_update" : "settings.update";
  await logAudit(req, auditAction, "settings", undefined, {
    category,
    previous,
    next: parsed,
    ...(prefixMigration
      ? {
          employeeIdPrefixMigration: {
            from: prefixMigration.previousPrefix,
            to: prefixMigration.nextPrefix,
            renamedCount: prefixMigration.renamedCount,
            remappedDueToConflictCount: prefixMigration.remappedDueToConflictCount,
          },
        }
      : {}),
  });
  res.json({
    settings,
    category: settings[category],
    ...(prefixMigration
      ? {
          employeeIdPrefixMigration: {
            from: prefixMigration.previousPrefix,
            to: prefixMigration.nextPrefix,
            renamedCount: prefixMigration.renamedCount,
            remappedDueToConflictCount: prefixMigration.remappedDueToConflictCount,
          },
        }
      : {}),
  });
});

function sendBackupDownload(res: Response, filename: string, payload: unknown): void {
  const json = JSON.stringify(payload, null, 2);
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(json);
}

async function markBackupCompleted(userId: string): Promise<string> {
  const lastBackupAt = new Date().toISOString();
  const next: BackupSettings = {
    ...getSettings().backup,
    lastBackupAt,
  };
  await updateCategory("backup", next, userId);
  return lastBackupAt;
}

export const getBackupStatus = asyncHandler(async (_req: Request, res: Response) => {
  const [status, backup] = await Promise.all([
    backupService.getDatabaseStatus(),
    Promise.resolve(getSettings().backup),
  ]);
  res.json({ status, backup });
});

export const getStorageStatus = asyncHandler(async (_req: Request, res: Response) => {
  const [status, storage] = await Promise.all([
    backupService.getDatabaseStatus(),
    getStorageBreakdown(),
  ]);
  res.json({ status, storage });
});

export const getCleanupOptions = asyncHandler(async (_req: Request, res: Response) => {
  const summary = await getCleanupCenterSummary();
  res.json(summary);
});

export const cleanupData = asyncHandler(async (req: Request, res: Response) => {
  const input = cleanupConfirmSchema.parse(req.body);
  if (!CLEANUP_TARGETS.includes(input.category)) {
    throw ApiError.badRequest("Unsupported cleanup category");
  }

  await requireVerifiedOtp({
    req,
    purpose: "database_cleanup",
    otpChallengeId: input.otpChallengeId,
    otpCode: input.otpCode,
  });

  const result = await executeStorageCleanup(input.category);
  const [status, storage, cleanup] = await Promise.all([
    backupService.getDatabaseStatus(),
    getStorageBreakdown(),
    getCleanupCenterSummary(),
  ]);

  await logAudit(req, "settings.data_cleanup", "settings", undefined, {
    category: result.category,
    deletedRecords: result.deletedRecords,
    deletedFiles: result.deletedFiles,
    databaseSizeRecoveredBytes: result.databaseSizeRecoveredBytes,
    uploadedFilesRecoveredBytes: result.uploadedFilesRecoveredBytes,
    details: result.details,
  });

  res.json({
    success: true,
    result,
    status,
    storage,
    cleanup,
    backup: getSettings().backup,
  });
});

export const runBackupNow = asyncHandler(async (req: Request, res: Response) => {
  const { payload, filename } = await backupService.createBackupFile("full");
  const lastBackupAt = await markBackupCompleted(req.user!.id);
  await logAudit(req, "settings.backup_create", "settings", undefined, {
    filename,
    lastBackupAt,
    tableCounts: payload.manifest.tableCounts,
  });
  sendBackupDownload(res, filename, payload);
});

function sendBinaryDownload(
  res: Response,
  filename: string,
  buffer: Buffer,
  contentType: string
): void {
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buffer);
}

export const exportReadableReport = asyncHandler(async (req: Request, res: Response) => {
  const format = String(req.params.format ?? "").toLowerCase();
  const scopeParam = String(req.query.scope ?? "full").toLowerCase();
  const scope = scopeParam as ReadableReportScope;

  if (!["pdf", "excel"].includes(format)) {
    throw ApiError.badRequest("Report format must be pdf or excel");
  }
  if (!["full", "employees", "attendance"].includes(scope)) {
    throw ApiError.badRequest("Invalid report scope");
  }

  const bundle = await fetchReadableReportBundle(scope);
  const stamp = bundle.exportedAt.replace(/[:.]/g, "-");
  const baseName = scope === "full" ? "data-export-report" : `${scope}-report`;

  if (format === "pdf") {
    const buffer = await buildReadableReportPdf(bundle);
    const filename = `ozone-${baseName}-${stamp}.pdf`;
    await logAudit(req, "settings.export_report", "settings", undefined, {
      format,
      scope,
      filename,
      totals: bundle.totals,
    });
    sendBinaryDownload(res, filename, buffer, "application/pdf");
    return;
  }

  const buffer = await buildReadableReportExcel(bundle);
  const filename = `ozone-${baseName}-${stamp}.xlsx`;
  await logAudit(req, "settings.export_report", "settings", undefined, {
    format,
    scope,
    filename,
    totals: bundle.totals,
  });
  sendBinaryDownload(
    res,
    filename,
    buffer,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
});

export const exportBackupData = asyncHandler(async (req: Request, res: Response) => {
  const type = (req.params.type as BackupExportType) ?? "full";
  if (!["full", "attendance", "employees"].includes(type)) {
    throw ApiError.badRequest("Invalid export type");
  }
  const payload = await backupService.exportTables(type);
  const stamp = payload.manifest.exportedAt.replace(/[:.]/g, "-");
  const filename = `ozone-export-${type}-${stamp}.json`;
  await logAudit(req, "settings.export_data", "settings", undefined, { type, filename });
  sendBackupDownload(res, filename, payload);
});

export const restoreBackup = asyncHandler(async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) throw ApiError.badRequest("Backup file is required");

  let parsed: unknown;
  try {
    parsed = JSON.parse(file.buffer.toString("utf8"));
  } catch {
    throw ApiError.badRequest("Backup file must be valid JSON");
  }

  const payload = parseBackupPayload(parsed);
  const result = await backupService.restoreFromBackupPayload(payload);
  await refreshSettingsCache();
  await logAudit(req, "settings.restore_data", "settings", undefined, {
    restoredTables: result.restoredTables,
    rowCounts: result.rowCounts,
  });
  res.json({
    success: true,
    restoredTables: result.restoredTables,
    rowCounts: result.rowCounts,
  });
});

export const exportData = asyncHandler(async (req: Request, res: Response) => {
  const payload = await backupService.exportTables("full");
  await logAudit(req, "settings.export_data", "settings");
  res.json({ exportedAt: payload.manifest.exportedAt, data: payload.tables });
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

  const policyError = validatePasswordPolicy(input.newPassword);
  if (policyError) throw ApiError.badRequest(policyError);

  if (input.currentPassword.trim() === input.newPassword.trim()) {
    throw ApiError.badRequest("New password must be different from the current password");
  }

  await requireVerifiedOtp({
    req,
    purpose: "admin_password_change",
    otpChallengeId: input.otpChallengeId,
    otpCode: input.otpCode,
  });

  const hash = await bcrypt.hash(input.newPassword, 12);
  await pool.query(
    `UPDATE employees
        SET password_hash = $1,
            must_change_password = false,
            first_login_completed = true,
            password_changed_at = now(),
            updated_at = now()
      WHERE id = $2`,
    [hash, req.user!.id]
  );
  await logAudit(req, "auth.password_change", "employee", req.user!.id, {
    adminCode: req.user!.employeeCode,
    verifiedByEmailOtp: true,
  });
  res.json({ success: true });
});

export const listAuditLogs = asyncHandler(async (req: Request, res: Response) => {
  const q = auditQuerySchema.parse(req.query);
  const result = await listAuditLogsRepo({
    page: q.page,
    limit: q.limit,
    search: q.search,
    action: q.action,
    from: q.from,
    to: q.to,
    actorId: q.actorId,
    module: q.module,
    actionType: q.actionType,
    status: q.status,
  });

  res.json({
    ...result,
    retentionDays: getSettings().audit.retentionDays,
    totalAll: await countAuditLogs(),
    modules: AUDIT_MODULES,
    actionTypes: AUDIT_ACTION_TYPES,
    retentionOptions: AUDIT_RETENTION_DAYS,
  });
});

export const getAuditLog = asyncHandler(async (req: Request, res: Response) => {
  const log = await getAuditLogById(req.params.id);
  if (!log) throw ApiError.notFound("Audit log not found");
  res.json({ log });
});

export const clearAuditLogs = asyncHandler(async (req: Request, res: Response) => {
  const input = auditClearSchema.parse(req.body);
  await requireVerifiedOtp({
    req,
    purpose: "database_cleanup",
    otpChallengeId: input.otpChallengeId,
    otpCode: input.otpCode,
  });
  const deleted = await clearAllAuditLogs();
  await logAudit(req, "settings.audit_clear", "audit", undefined, {
    deletedRecords: deleted,
    verifiedByEmailOtp: true,
  });
  res.json({
    success: true,
    deletedRecords: deleted,
    retentionDays: getSettings().audit.retentionDays,
  });
});

export const exportAuditLogs = asyncHandler(async (req: Request, res: Response) => {
  const format = auditExportFormatSchema.parse(req.params.format);
  const q = auditQuerySchema.omit({ page: true, limit: true }).parse(req.query);
  const logs = await fetchAuditLogsForExport({
    search: q.search,
    action: q.action,
    from: q.from,
    to: q.to,
    actorId: q.actorId,
    module: q.module,
    actionType: q.actionType,
    status: q.status,
  });

  await logAudit(req, "settings.export_report", "audit", undefined, {
    format,
    scope: "audit",
    count: logs.length,
  });

  const stamp = new Date().toISOString().slice(0, 10);
  if (format === "excel") {
    const buffer = await buildAuditLogsExcel(logs);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="ozone-audit-logs-${stamp}.xlsx"`
    );
    res.send(buffer);
    return;
  }

  const buffer = await buildAuditLogsPdf(logs);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="ozone-audit-logs-${stamp}.pdf"`
  );
  res.send(buffer);
});

export const refreshSettings = asyncHandler(async (_req: Request, res: Response) => {
  const settings = await refreshSettingsCache();
  res.json({ settings });
});
