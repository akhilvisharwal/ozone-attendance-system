import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { todayDateString } from "../../utils/date";
import * as dashboardStats from "./dashboard.stats";

export const getSummary = asyncHandler(async (_req: Request, res: Response) => {
  const date = todayDateString();
  const summary = await dashboardStats.getDashboardSummary(date);
  res.json({ summary, date });
});

export const getTodayAttendance = asyncHandler(async (_req: Request, res: Response) => {
  const date = todayDateString();
  const items = await dashboardStats.listTodayAttendanceWithEmployees(date);
  res.json({ items, date });
});
