import { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/errors";
import { logAudit } from "../audit/audit.repository";
import * as repo from "./advances.repository";
import {
  advanceCreateSchema,
  advanceListQuerySchema,
  advanceOtpRequestSchema,
  advanceUpdateSchema,
} from "./advances.validators";
import { extractOtpFields, requestAdvanceOtp, requireAdvanceOtp } from "./advances.otp";

/** Step 1 of the OTP gate: request a code naming the specific employee involved. */
export const requestOtp = asyncHandler(async (req: Request, res: Response) => {
  const input = advanceOtpRequestSchema.parse(req.body);
  const result = await requestAdvanceOtp(req, input.action, input.employeeId);
  res.json({
    ...result,
    message: `A verification code was sent to ${result.maskedEmail}.`,
  });
});

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
  const { otpChallengeId, otpCode, rest } = extractOtpFields(req.body);
  const input = advanceCreateSchema.parse(rest);

  if (!(await repo.employeeExistsForAdvance(input.employeeId))) {
    throw ApiError.badRequest("Employee not found");
  }

  await requireAdvanceOtp(req, "create", input.employeeId, otpChallengeId, otpCode);

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
  const { otpChallengeId, otpCode, rest } = extractOtpFields(req.body);
  const input = advanceUpdateSchema.parse(rest);

  const existing = await repo.findAdvanceById(id);
  if (!existing) throw ApiError.notFound("Advance entry not found");
  if (existing.planId) {
    throw ApiError.badRequest(
      "This entry belongs to a repayment plan — edit the plan or its installments instead."
    );
  }

  await requireAdvanceOtp(req, "edit", existing.employeeId, otpChallengeId, otpCode);

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
  const { otpChallengeId, otpCode } = extractOtpFields(req.body);

  const existing = await repo.findAdvanceById(id);
  if (!existing) throw ApiError.notFound("Advance entry not found");
  if (existing.planId) {
    throw ApiError.badRequest(
      "This entry belongs to a repayment plan — cancel or delete the plan instead."
    );
  }

  await requireAdvanceOtp(req, "delete", existing.employeeId, otpChallengeId, otpCode);

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
