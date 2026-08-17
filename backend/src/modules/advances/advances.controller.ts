import { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/errors";
import { logAudit } from "../audit/audit.repository";
import * as repo from "./advances.repository";
import {
  advanceCreateSchema,
  advanceListQuerySchema,
  advanceUpdateSchema,
} from "./advances.validators";

/** Ledger + running balance for one employee (or all employees when unfiltered). */
export const listAdvances = asyncHandler(async (req: Request, res: Response) => {
  const query = advanceListQuerySchema.parse(req.query);
  const entries = await repo.listAdvances(query);

  const balance = query.employeeId
    ? await repo.getBalanceForEmployee(query.employeeId)
    : entries.reduce(
        (sum, e) => sum + (e.entryType === "taken" ? e.amount : -e.amount),
        0
      );

  const totals = entries.reduce(
    (acc, e) => {
      if (e.entryType === "taken") acc.taken += e.amount;
      else acc.returned += e.amount;
      return acc;
    },
    { taken: 0, returned: 0 }
  );

  res.json({ entries, balance, totals });
});

/** Outstanding balance per employee, for list views. */
export const getAllBalances = asyncHandler(async (_req: Request, res: Response) => {
  const balances = await repo.getBalancesForAllEmployees();
  res.json({
    balances: Array.from(balances.entries()).map(([employeeId, balance]) => ({
      employeeId,
      balance,
    })),
  });
});

export const createAdvance = asyncHandler(async (req: Request, res: Response) => {
  const input = advanceCreateSchema.parse(req.body);

  if (!(await repo.employeeExistsForAdvance(input.employeeId))) {
    throw ApiError.badRequest("Employee not found");
  }

  const entry = await repo.createAdvance({
    employeeId: input.employeeId,
    entryDate: input.entryDate,
    amount: input.amount,
    entryType: input.entryType,
    note: input.note ?? null,
    createdBy: req.user!.id,
  });

  await logAudit(req, "advance.create", "employee_advance", entry.id, {
    employeeId: entry.employeeId,
    entryDate: entry.entryDate,
    amount: entry.amount,
    entryType: entry.entryType,
    note: entry.note,
  });

  const balance = await repo.getBalanceForEmployee(entry.employeeId);
  res.status(201).json({ entry, balance });
});

export const updateAdvance = asyncHandler(async (req: Request, res: Response) => {
  const id = z.string().uuid().parse(req.params.id);
  const input = advanceUpdateSchema.parse(req.body);

  const existing = await repo.findAdvanceById(id);
  if (!existing) throw ApiError.notFound("Advance entry not found");

  const entry = await repo.updateAdvance(id, input);
  if (!entry) throw ApiError.notFound("Advance entry not found");

  await logAudit(req, "advance.update", "employee_advance", entry.id, {
    employeeId: entry.employeeId,
    before: {
      entryDate: existing.entryDate,
      amount: existing.amount,
      entryType: existing.entryType,
      note: existing.note,
    },
    after: {
      entryDate: entry.entryDate,
      amount: entry.amount,
      entryType: entry.entryType,
      note: entry.note,
    },
  });

  const balance = await repo.getBalanceForEmployee(entry.employeeId);
  res.json({ entry, balance });
});

export const deleteAdvance = asyncHandler(async (req: Request, res: Response) => {
  const id = z.string().uuid().parse(req.params.id);

  const existing = await repo.findAdvanceById(id);
  if (!existing) throw ApiError.notFound("Advance entry not found");

  await repo.deleteAdvance(id);

  await logAudit(req, "advance.delete", "employee_advance", id, {
    employeeId: existing.employeeId,
    entryDate: existing.entryDate,
    amount: existing.amount,
    entryType: existing.entryType,
  });

  const balance = await repo.getBalanceForEmployee(existing.employeeId);
  res.json({ success: true, balance });
});
