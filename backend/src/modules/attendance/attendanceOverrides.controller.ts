import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/errors";
import { todayDateString } from "../../utils/date";
import { logAudit } from "../audit/audit.repository";
import * as repo from "./attendanceOverrides.repository";
import {
  createAttendanceOverrideSchema,
  setOverrideEnabledSchema,
  updateAttendanceOverrideSchema,
} from "./attendanceOverrides.validators";
import {
  assertNoAssignmentConflict,
  getEffectiveAttendanceRules,
} from "./attendanceRules.service";
import {
  calendarStatusForOverride,
  mapOverrideRow,
} from "./attendanceOverrides.types";
import type { Request, Response } from "express";

function toWriteInput(
  input: ReturnType<typeof createAttendanceOverrideSchema.parse>,
  createdBy?: string | null
): repo.OverrideWriteInput {
  return {
    startDate: input.startDate,
    endDate: input.endDate,
    reason: input.reason,
    officeStartTime: input.officeStartTime ?? null,
    lateCheckInTime: input.lateCheckInTime ?? null,
    halfDayCutoff: input.halfDayCutoff ?? null,
    officeClosingTime: input.officeClosingTime ?? null,
    minHoursPresent: input.minHoursPresent ?? null,
    minHoursHalfDay: input.minHoursHalfDay ?? null,
    applyToAll: input.applyToAll,
    employeeIds: input.applyToAll ? [] : input.employeeIds,
    createdBy,
  };
}

function mapListItem(
  row: Awaited<ReturnType<typeof repo.listAllOverrides>>["rows"][number],
  employeesByOverride: Map<string, { id: string; employeeCode: string; name: string }[]>,
  today: string
) {
  const employees = employeesByOverride.get(row.id) ?? [];
  return {
    ...mapOverrideRow(row, employees),
    status: calendarStatusForOverride(row, today),
  };
}

export const listOverrides = asyncHandler(async (_req: Request, res: Response) => {
  const { rows, employeesByOverride } = await repo.listAllOverrides();
  const today = todayDateString();
  res.json({
    items: rows.map((row) => mapListItem(row, employeesByOverride, today)),
  });
});

export const getOverrideById = asyncHandler(async (req: Request, res: Response) => {
  const found = await repo.findOverrideWithEmployees(req.params.id);
  if (!found) throw ApiError.notFound("Attendance override not found");
  const today = todayDateString();
  res.json({
    override: {
      ...mapOverrideRow(found.row, found.employees),
      status: calendarStatusForOverride(found.row, today),
    },
  });
});

export const getActiveOverride = asyncHandler(async (req: Request, res: Response) => {
  const date = typeof req.query.date === "string" ? req.query.date : todayDateString();
  const employeeId =
    typeof req.query.employeeId === "string"
      ? req.query.employeeId
      : req.user?.role === "employee"
        ? req.user.id
        : undefined;
  const { activeOverride } = await getEffectiveAttendanceRules(date, employeeId ?? null);
  res.json({ activeOverride });
});

export const createOverride = asyncHandler(async (req: Request, res: Response) => {
  const input = createAttendanceOverrideSchema.parse(req.body);

  try {
    await assertNoAssignmentConflict(
      input.startDate,
      input.endDate,
      input.applyToAll,
      input.employeeIds,
    );
  } catch (err) {
    throw ApiError.conflict(err instanceof Error ? err.message : "Assignment conflict");
  }

  const row = await repo.createOverride(toWriteInput(input, req.user!.id));
  const found = await repo.findOverrideWithEmployees(row.id);
  const today = todayDateString();

  await logAudit(req, "attendance.override.create", "attendance_daily_override", row.id, {
    startDate: input.startDate,
    endDate: input.endDate,
    reason: input.reason,
    applyToAll: input.applyToAll,
    employeeCount: input.applyToAll ? "all" : input.employeeIds.length,
  });

  res.status(201).json({
    override: {
      ...mapOverrideRow(found!.row, found!.employees),
      status: calendarStatusForOverride(found!.row, today),
    },
  });
});

export const updateOverride = asyncHandler(async (req: Request, res: Response) => {
  const input = updateAttendanceOverrideSchema.parse(req.body);
  const existing = await repo.findOverrideById(req.params.id);
  if (!existing) throw ApiError.notFound("Attendance override not found");

  try {
    await assertNoAssignmentConflict(
      input.startDate,
      input.endDate,
      input.applyToAll,
      input.employeeIds,
      req.params.id
    );
  } catch (err) {
    throw ApiError.conflict(err instanceof Error ? err.message : "Assignment conflict");
  }

  const row = await repo.updateOverride(req.params.id, toWriteInput(input));
  if (!row) throw ApiError.notFound("Attendance override not found");

  const found = await repo.findOverrideWithEmployees(row.id);
  const today = todayDateString();

  await logAudit(req, "attendance.override.update", "attendance_daily_override", row.id, {
    startDate: input.startDate,
    endDate: input.endDate,
    reason: input.reason,
    applyToAll: input.applyToAll,
    employeeCount: input.applyToAll ? "all" : input.employeeIds.length,
  });

  res.json({
    override: {
      ...mapOverrideRow(found!.row, found!.employees),
      status: calendarStatusForOverride(found!.row, today),
    },
  });
});

export const setOverrideEnabled = asyncHandler(async (req: Request, res: Response) => {
  const { isEnabled } = setOverrideEnabledSchema.parse(req.body);
  const existing = await repo.findOverrideById(req.params.id);
  if (!existing) throw ApiError.notFound("Attendance override not found");

  if (isEnabled) {
    const found = await repo.findOverrideWithEmployees(req.params.id);
    if (!found) throw ApiError.notFound("Attendance override not found");
    try {
      await assertNoAssignmentConflict(
        found.row.start_date,
        found.row.end_date,
        found.row.apply_to_all,
        found.employees.map((e) => e.id),
        req.params.id
      );
    } catch (err) {
      throw ApiError.conflict(err instanceof Error ? err.message : "Assignment conflict");
    }
  }

  const row = await repo.setOverrideEnabled(req.params.id, isEnabled);
  if (!row) throw ApiError.notFound("Attendance override not found");

  const found = await repo.findOverrideWithEmployees(row.id);
  const today = todayDateString();

  await logAudit(req, "attendance.override.toggle", "attendance_daily_override", row.id, {
    isEnabled,
  });

  res.json({
    override: {
      ...mapOverrideRow(found!.row, found!.employees),
      status: calendarStatusForOverride(found!.row, today),
    },
  });
});

export const deleteOverride = asyncHandler(async (req: Request, res: Response) => {
  const existing = await repo.findOverrideById(req.params.id);
  if (!existing) throw ApiError.notFound("Attendance override not found");

  await repo.deleteOverride(req.params.id);

  await logAudit(req, "attendance.override.delete", "attendance_daily_override", req.params.id, {
    reason: existing.reason,
  });

  res.status(204).send();
});
