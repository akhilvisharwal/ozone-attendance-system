import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { todayDateString } from "../../utils/date";
import { getSettings } from "../settings/settings.cache";
import * as attendanceRepo from "../attendance/attendance.repository";

export const getSummary = asyncHandler(async (_req: Request, res: Response) => {
  const lateAfter = getSettings().attendance.lateCheckInTime;
  const summary = await attendanceRepo.getDashboardSummary(todayDateString(), lateAfter);
  res.json({ summary, date: todayDateString() });
});

export const getTodayAttendance = asyncHandler(async (_req: Request, res: Response) => {
  const items = await attendanceRepo.listTodayAttendanceWithEmployees(todayDateString());
  res.json({ items, date: todayDateString() });
});
