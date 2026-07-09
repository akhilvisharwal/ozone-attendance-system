import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/errors";
import { todayDateString } from "../../utils/date";
import {
  createHolidaySchema,
  updateHolidaySchema,
  listHolidaysQuerySchema,
  upcomingHolidaysQuerySchema,
} from "./holidays.validators";
import * as repo from "./holidays.repository";
import { resolveHolidaysInRange, resolveUpcoming } from "./holidays.service";
import { logAudit } from "../audit/audit.repository";
import { notifyHoliday } from "../../services/notifications.service";

export const listHolidays = asyncHandler(async (req: Request, res: Response) => {
  const query = listHolidaysQuerySchema.parse(req.query);

  if (query.from && query.to) {
    const raw = await repo.listHolidaysForRange(query.from, query.to);
    const resolved = Array.from(resolveHolidaysInRange(raw, query.from, query.to).values());
    res.json({ items: raw, resolved, from: query.from, to: query.to });
    return;
  }

  const items = await repo.listAllHolidays(query.year);
  res.json({ items, year: query.year ?? null });
});

export const upcomingHolidays = asyncHandler(async (req: Request, res: Response) => {
  const { limit } = upcomingHolidaysQuerySchema.parse(req.query);
  const today = todayDateString();
  const toYear = parseInt(today.slice(0, 4), 10) + 1;
  const raw = await repo.listHolidaysForRange(today, `${toYear}-12-31`);
  const items = resolveUpcoming(raw, today, limit);
  res.json({ items });
});

export const getHoliday = asyncHandler(async (req: Request, res: Response) => {
  const holiday = await repo.findHolidayById(req.params.id);
  if (!holiday) throw ApiError.notFound("Holiday not found");
  res.json({ holiday });
});

export const createHoliday = asyncHandler(async (req: Request, res: Response) => {
  const input = createHolidaySchema.parse(req.body);

  if (input.holidayType === "one_time" && input.holidayDate) {
    const clash = await repo.findOneTimeByDate(input.holidayDate);
    if (clash) throw ApiError.conflict("A holiday already exists on this date");
  }

  const holiday = await repo.createHoliday({
    name: input.name,
    description: input.description,
    holidayType: input.holidayType,
    holidayDate: input.holidayDate,
    recurringMonth: input.recurringMonth,
    recurringDay: input.recurringDay,
  });

  await logAudit(req, "holiday.create", "holiday", holiday.id, { name: holiday.name });

  const holidayDate =
    holiday.holiday_type === "one_time" && holiday.holiday_date
      ? holiday.holiday_date
      : todayDateString();
  await notifyHoliday({ title: holiday.name, date: holidayDate });

  res.status(201).json({ holiday });
});

export const updateHoliday = asyncHandler(async (req: Request, res: Response) => {
  const input = updateHolidaySchema.parse(req.body);
  const existing = await repo.findHolidayById(req.params.id);
  if (!existing) throw ApiError.notFound("Holiday not found");

  const nextType = input.holidayType ?? existing.holiday_type;
  const nextDate = nextType === "one_time" ? (input.holidayDate ?? existing.holiday_date) : null;
  if (nextType === "one_time" && nextDate) {
    const clash = await repo.findOneTimeByDate(nextDate);
    if (clash && clash.id !== existing.id) throw ApiError.conflict("A holiday already exists on this date");
  }

  const holiday = await repo.updateHoliday(existing.id, {
    name: input.name,
    description: input.description,
    holidayType: input.holidayType,
    holidayDate: input.holidayDate,
    recurringMonth: input.recurringMonth,
    recurringDay: input.recurringDay,
  });

  await logAudit(req, "holiday.update", "holiday", existing.id);
  res.json({ holiday });
});

export const deleteHoliday = asyncHandler(async (req: Request, res: Response) => {
  const existing = await repo.findHolidayById(req.params.id);
  if (!existing) throw ApiError.notFound("Holiday not found");

  await repo.deleteHoliday(existing.id);
  await logAudit(req, "holiday.delete", "holiday", existing.id, { name: existing.name });
  res.json({ message: "Holiday deleted" });
});

/** Quick-create a one-time holiday for a specific date (used from the calendar). */
export const createHolidayForDate = asyncHandler(async (req: Request, res: Response) => {
  const date = req.params.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw ApiError.badRequest("Invalid date");

  const input = createHolidaySchema.parse({ ...req.body, holidayType: "one_time", holidayDate: date });
  const clash = await repo.findOneTimeByDate(date);
  if (clash) throw ApiError.conflict("A holiday already exists on this date. Edit or delete it first.");

  const holiday = await repo.createHoliday({
    name: input.name,
    description: input.description,
    holidayType: "one_time",
    holidayDate: date,
  });

  await logAudit(req, "holiday.create", "holiday", holiday.id, { date, name: holiday.name });
  await notifyHoliday({ title: holiday.name, date });
  res.status(201).json({ holiday });
});
