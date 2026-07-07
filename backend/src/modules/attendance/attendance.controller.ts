import { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/errors";
import { todayDateString, minutesBetween } from "../../utils/date";
import { storage } from "../../services/storage";
import { reverseGeocode } from "../../services/geocode";
import { classifyCheckIn, classifyCheckOut, classifyDayStatus, getTimingRules } from "../../utils/attendanceTiming";
import { getSettings } from "../settings/settings.cache";
import {
  checkInSchema,
  checkOutSchema,
  myHistoryQuerySchema,
  adminListQuerySchema,
  monthlyQuerySchema,
  monthlyExportQuerySchema,
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
import { logAudit } from "../audit/audit.repository";

export const checkIn = asyncHandler(async (req: Request, res: Response) => {
  const input = checkInSchema.parse(req.body);
  const selfieFile = req.file;
  const mobile = getSettings().mobile;
  const attendanceSettings = getSettings().attendance;

  if (mobile.selfieRequiredCheckIn && !selfieFile) {
    throw ApiError.badRequest("A live selfie captured from the camera is required to check in");
  }

  if (mobile.gpsRequiredCheckIn && (input.latitude === undefined || input.longitude === undefined)) {
    throw ApiError.badRequest("GPS location is required to check in");
  }

  if (
    input.accuracy !== undefined &&
    input.accuracy > mobile.gpsAccuracyThresholdMeters
  ) {
    throw ApiError.badRequest(
      `GPS accuracy (${Math.round(input.accuracy)}m) exceeds the allowed threshold of ${mobile.gpsAccuracyThresholdMeters}m`
    );
  }

  const employeeId = req.user!.id;
  const today = todayDateString();

  const existing = await repo.findTodayAttendance(employeeId, today);
  if (existing && !attendanceSettings.allowMultipleCheckIns) {
    throw ApiError.conflict(
      existing.status === "checked_in"
        ? "You have already checked in today"
        : "You have already completed attendance for today"
    );
  }

  const site = await sitesRepo.findSiteById(input.siteId);
  if (!site || !site.is_active) {
    throw ApiError.badRequest("The selected project/site is not available. Please choose an active site.");
  }

  const checkInTime = new Date();
  const { status: checkInStatus, isHalfDay } = classifyCheckIn(checkInTime);

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

  const record = await repo.createCheckIn({
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
  });

  await logAudit(req, "attendance.check_in", "attendance", record.id, { checkInStatus, isHalfDay });

  res.status(201).json({ attendance: record, checkInStatus, isHalfDay });
});

export const checkOut = asyncHandler(async (req: Request, res: Response) => {
  const input = checkOutSchema.parse(req.body);
  const mobile = getSettings().mobile;
  const attendanceSettings = getSettings().attendance;

  if (input.latitude === undefined || input.longitude === undefined) {
    throw ApiError.badRequest(
      "GPS location is required to check out. Please enable location services in your browser and try again."
    );
  }

  if (input.accuracy === undefined) {
    throw ApiError.badRequest(
      "GPS location is required to check out. Please enable location services in your browser and try again."
    );
  }

  if (
    input.accuracy !== undefined &&
    input.accuracy > mobile.gpsAccuracyThresholdMeters
  ) {
    throw ApiError.badRequest(
      `GPS accuracy (${Math.round(input.accuracy)}m) exceeds the allowed threshold of ${mobile.gpsAccuracyThresholdMeters}m`
    );
  }

  const employeeId = req.user!.id;
  const today = todayDateString();

  const existing = await repo.findTodayAttendance(employeeId, today);
  if (!existing) {
    throw ApiError.badRequest("You must check in before you can check out");
  }
  if (existing.status === "checked_out") {
    throw ApiError.conflict("You have already checked out today");
  }

  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  const sitePhotoPaths: string[] = [];
  for (const file of files) {
    const { relativePath } = await storage.save(file.buffer, file.originalname, `site-photos/${req.user!.employeeCode}`);
    sitePhotoPaths.push(relativePath);
  }

  let address: string | null = null;
  if (input.latitude !== undefined && input.longitude !== undefined) {
    address = await reverseGeocode(input.latitude, input.longitude);
  }

  const checkOutTime = new Date();
  const totalMinutes = minutesBetween(new Date(existing.check_in_time as unknown as string), checkOutTime);
  const checkOutStatus = classifyCheckOut(checkOutTime);
  const dayStatus = attendanceSettings.autoCalculate
    ? classifyDayStatus(totalMinutes)
    : existing.is_half_day
      ? ("half_day" as const)
      : ("present" as const);

  const record = await repo.completeCheckOut({
    id: existing.id,
    checkOutTime,
    latitude: input.latitude,
    longitude: input.longitude,
    address,
    gpsAccuracy: input.accuracy,
    workSummary: input.workSummary?.trim() || existing.work_summary || null,
    workStatus: input.workStatus,
    remarks: input.remarks ?? null,
    sitePhotoPaths,
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
export const timingRules = asyncHandler(async (_req: Request, res: Response) => {
  res.json({ rules: getTimingRules() });
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

/** Shared guard: block silent overwrites unless the admin explicitly overrides. */
async function ensureCanMark(
  employeeId: string,
  date: string,
  override: boolean | undefined
) {
  const existing = await repo.findTodayAttendance(employeeId, date);
  if (existing && !override) {
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

  const record = await repo.adminMarkPresent({
    employeeId: input.employeeId,
    date: input.date,
    adminId: req.user!.id,
    reason: input.reason ?? null,
    totalMinutes: Math.round(getSettings().attendance.minHoursPresent * 60),
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

  const record = await repo.adminMarkHalfDay({
    employeeId: input.employeeId,
    date: input.date,
    adminId: req.user!.id,
    reason: input.reason ?? null,
    totalMinutes: Math.round(getSettings().attendance.minHoursHalfDay * 60),
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

  const record = await repo.adminMarkAbsent({
    employeeId: input.employeeId,
    date: input.date,
    adminId: req.user!.id,
    reason: input.reason ?? null,
  });

  await logAudit(req, "attendance.admin_mark_absent", "attendance", record.id, {
    employeeId: input.employeeId, date: input.date, reason: input.reason, overrode: !!existing,
  });

  res.status(existing ? 200 : 201).json({ attendance: record });
});
