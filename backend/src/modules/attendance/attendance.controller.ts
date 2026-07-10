import { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/errors";
import { todayDateString, minutesBetween } from "../../utils/date";
import { storage } from "../../services/storage";
import { reverseGeocode } from "../../services/geocode";
import { classifyCheckIn, classifyCheckOut, getTimingRulesFromSettings } from "../../utils/attendanceTiming";
import { resolveAutomaticDayStatus } from "./attendanceDayStatus";
import { getSettings } from "../settings/settings.cache";
import { validateAttendanceCapture } from "../../utils/attendanceCapture";
import { getEffectiveAttendanceRules } from "./attendanceRules.service";
import {
  checkInSchema,
  checkOutSchema,
  myHistoryQuerySchema,
  adminListQuerySchema,
  monthlyQuerySchema,
  monthlyExportQuerySchema,
  manualAttendanceSchema,
  manualAttendanceDeleteSchema,
} from "./attendance.validators";
import * as repo from "./attendance.repository";
import * as sitesRepo from "../sites/sites.repository";
import {
  buildMonthlyGrid,
  resolveMonth,
} from "./attendance.monthly";
import { buildMonthlyCalendarPdf } from "./attendance.monthlyPdf";
import { buildMonthlyCalendarExcel } from "./attendance.monthlyExcel";
import * as employeesRepo from "../employees/employees.repository";
import { resolveOffDayContext } from "./attendance.offDay";
import { logAudit } from "../audit/audit.repository";
import { sendManualAttendanceReminder } from "../../services/notifications.service";
import { listEmployeesEligibleForAttendanceReminder } from "./attendance.reminders";

export const checkIn = asyncHandler(async (req: Request, res: Response) => {
  const input = checkInSchema.parse(req.body);
  const selfieFile = req.file;
  const mobile = getSettings().mobile;
  const attendanceSettings = getSettings().attendance;
  const userAgent = input.deviceInfo ?? req.headers["user-agent"] ?? null;

  const captureError = validateAttendanceCapture({
    mobile,
    userAgent,
    action: "check-in",
    hasSelfie: Boolean(selfieFile),
    hasGps: input.latitude !== undefined && input.longitude !== undefined,
    accuracy: input.accuracy,
  });
  if (captureError) throw ApiError.badRequest(captureError);

  const employeeId = req.user!.id;

  if (getSettings().employee.profilePhotoRequired) {
    const me = await employeesRepo.findEmployeeById(employeeId);
    if (!me?.profile_photo_path) {
      throw ApiError.badRequest(
        "A profile photo is required before check-in. Upload your photo from the menu, then try again."
      );
    }
  }

  const today = todayDateString();

  const existing = await repo.findTodayAttendance(employeeId, today);
  if (existing) {
    if (!attendanceSettings.allowMultipleCheckIns) {
      throw ApiError.conflict(
        existing.status === "checked_in"
          ? "You have already checked in today"
          : "You have already completed attendance for today"
      );
    }
    if (existing.status === "checked_in") {
      throw ApiError.conflict("You have already checked in today");
    }
  }

  const site = await sitesRepo.findSiteById(input.siteId);
  if (!site || !site.is_active) {
    throw ApiError.badRequest("The selected project/site is not available. Please choose an active site.");
  }

  const checkInTime = new Date();
  const { settings: effectiveRules } = await getEffectiveAttendanceRules(today, employeeId);
  const { status: checkInStatus, isHalfDay } = classifyCheckIn(checkInTime, effectiveRules);

  const address =
    input.latitude !== undefined && input.longitude !== undefined
      ? await reverseGeocode(input.latitude, input.longitude)
      : null;

  let relativePath: string | null = null;
  if (selfieFile) {
    const saved = await storage.save(
      selfieFile.buffer,
      selfieFile.originalname,
      `selfies/${req.user!.employeeCode}`
    );
    relativePath = saved.relativePath;
  }

  const offDay = await resolveOffDayContext(employeeId, today);

  const record =
    existing?.status === "checked_out" && attendanceSettings.allowMultipleCheckIns
      ? await repo.reopenForCheckIn({
          id: existing.id,
          checkInTime,
          latitude: input.latitude ?? null,
          longitude: input.longitude ?? null,
          address,
          selfiePath: relativePath ?? existing.check_in_selfie_path ?? "",
          deviceInfo: input.deviceInfo ?? req.headers["user-agent"] ?? null,
          checkInStatus,
          isHalfDay,
          siteId: input.siteId,
          workSummary: input.workSummary ?? null,
          workStatus: input.workStatus ?? null,
        })
      : await repo.createCheckIn({
          employeeId,
          date: today,
          checkInTime,
          latitude: input.latitude ?? null,
          longitude: input.longitude ?? null,
          address,
          selfiePath: relativePath ?? "",
          deviceInfo: input.deviceInfo ?? req.headers["user-agent"] ?? null,
          checkInStatus,
          isHalfDay,
          siteId: input.siteId,
          workSummary: input.workSummary ?? null,
          workStatus: input.workStatus ?? null,
          specialDayStatus: offDay.specialDayStatus,
        });

  await logAudit(req, "attendance.check_in", "attendance", record.id, {
    checkInStatus,
    isHalfDay,
    specialDayStatus: offDay.specialDayStatus,
  });

  res.status(201).json({ attendance: record, checkInStatus, isHalfDay });
});

export const checkOut = asyncHandler(async (req: Request, res: Response) => {
  const input = checkOutSchema.parse(req.body);
  const mobile = getSettings().mobile;
  const attendanceSettings = getSettings().attendance;
  const uploaded = req.files as
    | { selfie?: Express.Multer.File[]; sitePhotos?: Express.Multer.File[] }
    | undefined;
  const selfieFile = uploaded?.selfie?.[0];
  const userAgent = input.deviceInfo ?? req.headers["user-agent"] ?? null;

  const captureError = validateAttendanceCapture({
    mobile,
    userAgent,
    action: "check-out",
    hasSelfie: Boolean(selfieFile),
    hasGps: input.latitude !== undefined && input.longitude !== undefined,
    accuracy: input.accuracy,
  });
  if (captureError) throw ApiError.badRequest(captureError);

  const employeeId = req.user!.id;
  const today = todayDateString();

  const existing = await repo.findTodayAttendance(employeeId, today);
  if (!existing) {
    throw ApiError.badRequest("You must check in before you can check out");
  }
  if (existing.status === "checked_out") {
    throw ApiError.conflict("You have already checked out today");
  }

  const sitePhotoFiles = uploaded?.sitePhotos ?? [];
  const sitePhotoPaths: string[] = [];
  for (const file of sitePhotoFiles) {
    const { relativePath } = await storage.save(file.buffer, file.originalname, `site-photos/${req.user!.employeeCode}`);
    sitePhotoPaths.push(relativePath);
  }

  let checkoutSelfiePath: string | null = null;
  if (selfieFile) {
    const saved = await storage.save(
      selfieFile.buffer,
      selfieFile.originalname,
      `selfies/${req.user!.employeeCode}`
    );
    checkoutSelfiePath = saved.relativePath;
  }

  let address: string | null = null;
  if (input.latitude !== undefined && input.longitude !== undefined) {
    address = await reverseGeocode(input.latitude, input.longitude);
  }

  const checkOutTime = new Date();
  const sessionMinutes = minutesBetween(new Date(existing.check_in_time as unknown as string), checkOutTime);
  const priorMinutes = existing.total_minutes ?? 0;
  const totalMinutes = priorMinutes + sessionMinutes;
  const { settings: effectiveRules } = await getEffectiveAttendanceRules(today, employeeId);
  const checkOutStatus = classifyCheckOut(checkOutTime, effectiveRules);
  const dayStatus = resolveAutomaticDayStatus({
    isHalfDay: Boolean(existing.is_half_day),
    checkInStatus: existing.check_in_status,
    totalMinutes,
    autoCalculate: attendanceSettings.autoCalculate,
    settings: effectiveRules,
  });

  const allPhotoPaths = checkoutSelfiePath
    ? [checkoutSelfiePath, ...sitePhotoPaths]
    : sitePhotoPaths;

  const record = await repo.completeCheckOut({
    id: existing.id,
    checkOutTime,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    address,
    gpsAccuracy: input.accuracy ?? null,
    workSummary: input.workSummary?.trim() || existing.work_summary || null,
    workStatus: input.workStatus,
    remarks: input.remarks ?? null,
    sitePhotoPaths: allPhotoPaths,
    totalMinutes,
    checkOutStatus,
    dayStatus,
  });

  await logAudit(req, "attendance.check_out", "attendance", record.id, { totalMinutes, dayStatus });

  res.json({ attendance: record, totalMinutes, dayStatus });
});

export const myToday = asyncHandler(async (req: Request, res: Response) => {
  const record = await repo.findTodayAttendance(req.user!.id, todayDateString());
  res.json({ attendance: record });
});

/** Returns whether today is a weekly off or holiday (for check-in confirmation). */
export const myCheckInContext = asyncHandler(async (req: Request, res: Response) => {
  const date = todayDateString();
  const [context, { activeOverride }] = await Promise.all([
    resolveOffDayContext(req.user!.id, date),
    getEffectiveAttendanceRules(date, req.user!.id),
  ]);
  res.json({ date, ...context, activeOverride });
});

export const myHistory = asyncHandler(async (req: Request, res: Response) => {
  const query = myHistoryQuerySchema.parse(req.query);
  const { items, total } = await repo.listMyAttendance(req.user!.id, query);
  res.json({ items, total, page: query.page, limit: query.limit });
});

/** Employee monthly attendance calendar for the selected month. */
export const myMonthly = asyncHandler(async (req: Request, res: Response) => {
  const query = monthlyQuerySchema.parse(req.query);
  const { year, month } = resolveMonth(query.month);
  const grid = await buildMonthlyGrid({
    year,
    month,
    employeeId: req.user!.id,
  });
  res.json(grid);
});

export const myAttendanceById = asyncHandler(async (req: Request, res: Response) => {
  const record = await repo.findAttendanceWithSiteById(req.params.id);
  if (!record || record.employee_id !== req.user!.id) {
    throw ApiError.notFound("Attendance record not found");
  }
  res.json({ attendance: record });
});

export const adminList = asyncHandler(async (req: Request, res: Response) => {
  const query = adminListQuerySchema.parse(req.query);
  const { items, total } = await repo.listAllAttendance(query);
  res.json({ items, total, page: query.page, limit: query.limit });
});

export const adminGetById = asyncHandler(async (req: Request, res: Response) => {
  const record = await repo.findAttendanceWithEmployeeById(req.params.id);
  if (!record) throw ApiError.notFound("Attendance record not found");
  res.json({ attendance: record });
});

/** Monthly attendance grid: per-employee day-by-day statuses + summary. */
export const adminMonthly = asyncHandler(async (req: Request, res: Response) => {
  const query = monthlyQuerySchema.parse(req.query);
  const { year, month } = resolveMonth(query.month);
  const grid = await buildMonthlyGrid({
    year,
    month,
    employeeId: query.employeeId,
    siteId: query.siteId,
  });
  res.json(grid);
});

/** Downloads a monthly attendance report (Excel / PDF). */
export const adminMonthlyExport = asyncHandler(async (req: Request, res: Response) => {
  const query = monthlyExportQuerySchema.parse(req.query);
  const format =
    query.format ??
    (getSettings().reports.defaultFormat === "pdf" ? "pdf" : "excel");
  const { year, month } = resolveMonth(query.month);

  const grid = await buildMonthlyGrid({
    year,
    month,
    employeeId: query.employeeId,
    siteId: query.siteId,
  });

  let generatedBy = req.user!.employeeCode;
  const admin = await employeesRepo.findEmployeeById(req.user!.id);
  if (admin?.name) generatedBy = admin.name;

  const meta = { generatedBy, generatedAt: new Date() };
  const filenameBase = `attendance-${year}-${String(month).padStart(2, "0")}`;

  if (format === "pdf") {
    const buffer = await buildMonthlyCalendarPdf(grid, meta);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filenameBase}.pdf"`);
    res.send(buffer);
    return;
  }

  const buffer = await buildMonthlyCalendarExcel(grid, meta);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filenameBase}.xlsx"`);
  res.send(buffer);
});

/** Returns the configured timing rules so the frontend can display live status. */
export const timingRules = asyncHandler(async (req: Request, res: Response) => {
  const date =
    typeof req.query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
      ? req.query.date
      : todayDateString();
  const { settings, activeOverride } = await getEffectiveAttendanceRules(
    date,
    req.user!.role === "employee" ? req.user!.id : undefined
  );
  res.json({ rules: getTimingRulesFromSettings(settings), activeOverride });
});

/** Check whether a given employee already has an attendance record for today. */
export const adminCheckToday = asyncHandler(async (req: Request, res: Response) => {
  const today = todayDateString();
  const record = await repo.findTodayAttendance(req.params.employeeId, today);
  res.json({ date: today, hasAttendance: !!record, record: record ?? null });
});

const adminMarkSchema = z.object({
  employeeId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().max(500).optional(),
  // Required to change a status that has already been recorded for the day.
  // The status stays locked until the next day unless the admin explicitly
  // confirms the override.
  override: z.boolean().optional(),
});

/** Shared guard: block silent overwrites of automatic attendance unless admin confirms. */
async function ensureCanMark(
  employeeId: string,
  date: string,
  override: boolean | undefined
) {
  const existing = await repo.findTodayAttendance(employeeId, date);
  if (existing && !existing.is_admin_marked && !override) {
    throw ApiError.conflict(
      "Attendance has already been recorded for this employee on that date. Confirm the change to override it."
    );
  }
  return existing;
}

export const adminMarkPresent = asyncHandler(async (req: Request, res: Response) => {
  if (!getSettings().attendance.allowManualOverride) {
    throw ApiError.forbidden("Manual attendance override is disabled in system settings");
  }
  const input = adminMarkSchema.parse(req.body);
  const existing = await ensureCanMark(input.employeeId, input.date, input.override);
  const { settings: effectiveRules } = await getEffectiveAttendanceRules(input.date, input.employeeId);

  const record = await repo.upsertManualAttendance({
    employeeId: input.employeeId,
    date: input.date,
    status: "present",
    adminId: req.user!.id,
    approvedById: req.user!.id,
    reason: input.reason ?? "Marked present by admin",
    totalMinutes: Math.round(effectiveRules.minHoursPresent * 60),
  });

  await logAudit(req, "attendance.admin_mark_present", "attendance", record.id, {
    employeeId: input.employeeId, date: input.date, reason: input.reason, overrode: !!existing,
  });

  res.status(existing ? 200 : 201).json({ attendance: record });
});

export const adminMarkHalfDay = asyncHandler(async (req: Request, res: Response) => {
  if (!getSettings().attendance.allowManualOverride) {
    throw ApiError.forbidden("Manual attendance override is disabled in system settings");
  }
  const input = adminMarkSchema.parse(req.body);
  const existing = await ensureCanMark(input.employeeId, input.date, input.override);
  const { settings: effectiveRules } = await getEffectiveAttendanceRules(input.date, input.employeeId);

  const record = await repo.upsertManualAttendance({
    employeeId: input.employeeId,
    date: input.date,
    status: "half_day",
    adminId: req.user!.id,
    approvedById: req.user!.id,
    reason: input.reason ?? "Marked half day by admin",
    totalMinutes: Math.round(effectiveRules.minHoursHalfDay * 60),
  });

  await logAudit(req, "attendance.admin_mark_half_day", "attendance", record.id, {
    employeeId: input.employeeId, date: input.date, reason: input.reason, overrode: !!existing,
  });

  res.status(existing ? 200 : 201).json({ attendance: record });
});

export const adminMarkAbsent = asyncHandler(async (req: Request, res: Response) => {
  if (!getSettings().attendance.allowManualOverride) {
    throw ApiError.forbidden("Manual attendance override is disabled in system settings");
  }
  const input = adminMarkSchema.parse(req.body);
  const existing = await ensureCanMark(input.employeeId, input.date, input.override);

  const record = await repo.upsertManualAttendance({
    employeeId: input.employeeId,
    date: input.date,
    status: "absent",
    adminId: req.user!.id,
    approvedById: req.user!.id,
    reason: input.reason ?? "Marked absent by admin",
  });

  await logAudit(req, "attendance.admin_mark_absent", "attendance", record.id, {
    employeeId: input.employeeId, date: input.date, reason: input.reason, overrode: !!existing,
  });

  res.status(existing ? 200 : 201).json({ attendance: record });
});

export const adminGetForDate = asyncHandler(async (req: Request, res: Response) => {
  const employeeId = z.string().uuid().parse(req.query.employeeId);
  const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.query.date);
  const record = await repo.findAttendanceWithEmployeeByDate(employeeId, date);
  res.json({ attendance: record });
});

export const saveManualAttendance = asyncHandler(async (req: Request, res: Response) => {
  if (!getSettings().attendance.allowManualOverride) {
    throw ApiError.forbidden("Manual attendance override is disabled in system settings");
  }

  const input = manualAttendanceSchema.parse(req.body);
  const existing = await ensureCanMark(input.employeeId, input.date, input.override ?? true);

  let totalMinutes = input.totalMinutes ?? null;
  const needsTimes =
    input.status === "present" ||
    input.status === "half_day" ||
    input.status === "holiday_worked" ||
    input.status === "weekly_off_worked";
  if (needsTimes && totalMinutes == null) {
    const { settings: effectiveRules } = await getEffectiveAttendanceRules(input.date, input.employeeId);
    totalMinutes =
      input.status === "half_day"
        ? Math.round(effectiveRules.minHoursHalfDay * 60)
        : Math.round(effectiveRules.minHoursPresent * 60);
    if (input.checkInTime && input.checkOutTime) {
      const computed = Math.max(
        0,
        Math.round(
          (new Date(`${input.date}T${input.checkOutTime}:00`).getTime() -
            new Date(`${input.date}T${input.checkInTime}:00`).getTime()) /
            60000
        )
      );
      if (computed > 0) totalMinutes = computed;
    }
  }

  const record = await repo.upsertManualAttendance({
    employeeId: input.employeeId,
    date: input.date,
    status: input.status,
    adminId: req.user!.id,
    approvedById: input.approvedById ?? req.user!.id,
    reason: input.reason,
    checkInTime: input.checkInTime ?? null,
    checkOutTime: input.checkOutTime ?? null,
    totalMinutes,
  });

  await logAudit(req, "attendance.manual_save", "attendance", record.id, {
    employeeId: input.employeeId,
    date: input.date,
    status: input.status,
    reason: input.reason,
    approvedById: input.approvedById ?? req.user!.id,
    overrode: !!existing,
  });

  const enriched = await repo.findAttendanceWithEmployeeByDate(input.employeeId, input.date);
  res.status(existing ? 200 : 201).json({ attendance: enriched ?? record });
});

export const deleteManualAttendance = asyncHandler(async (req: Request, res: Response) => {
  if (!getSettings().attendance.allowManualOverride) {
    throw ApiError.forbidden("Manual attendance override is disabled in system settings");
  }

  const input = manualAttendanceDeleteSchema.parse(req.body);
  const existing = await repo.findTodayAttendance(input.employeeId, input.date);
  if (!existing) throw ApiError.notFound("No attendance record found for that employee and date");
  if (!existing.is_admin_marked) {
    throw ApiError.conflict("Only manually entered attendance records can be deleted this way");
  }

  const deleted = await repo.deleteManualAttendance(input.employeeId, input.date);
  if (!deleted) throw ApiError.notFound("Manual attendance record not found");

  await logAudit(req, "attendance.manual_delete", "attendance", existing.id, {
    employeeId: input.employeeId,
    date: input.date,
    previousStatus: existing.admin_mark_status ?? existing.day_status,
    reason: existing.admin_mark_reason,
  });

  res.json({ success: true });
});

/** Remind employees who have not checked in today (permission: sendAttendanceReminders). */
export const sendAttendanceReminders = asyncHandler(async (req: Request, res: Response) => {
  const date = todayDateString();
  const recipients = await listEmployeesEligibleForAttendanceReminder(date);

  let sent = 0;
  for (const employee of recipients) {
    await sendManualAttendanceReminder({ employeeId: employee.id, employeeName: employee.name });
    sent += 1;
  }

  await logAudit(req, "attendance.remind", "attendance", undefined, {
    date,
    recipientCount: sent,
    recipients: recipients.map((row) => ({
      id: row.id,
      employeeCode: row.employee_code,
      name: row.name,
    })),
  });

  res.json({
    date,
    sent,
    recipients: recipients.map((row) => ({
      id: row.id,
      employeeCode: row.employee_code,
      name: row.name,
    })),
  });
});
