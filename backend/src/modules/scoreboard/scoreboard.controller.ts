import { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../../utils/asyncHandler";
import { getScoreboard, scoreLegendText } from "./scoreboard.repository";
import { todayDateString, toDateString } from "../../utils/date";

const querySchema = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional(),
});

function defaultRange() {
  const now = new Date();
  const from = toDateString(new Date(now.getFullYear(), now.getMonth(), 1));
  const to = todayDateString();
  return { from, to };
}

export const listScoreboard = asyncHandler(async (req: Request, res: Response) => {
  const q = querySchema.parse(req.query);
  const range = q.from && q.to ? { from: q.from, to: q.to } : defaultRange();
  const entries = await getScoreboard(range);
  res.json({ entries, period: range, legend: scoreLegendText() });
});
