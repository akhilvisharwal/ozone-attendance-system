import { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/errors";
import { logAudit } from "../audit/audit.repository";
import * as repo from "./advancePlans.repository";
import {
  CustomScheduleMismatchError,
  InstallmentNotFoundError,
  PlanHasPaymentsError,
  PlanNotEditableError,
  PlanNotFoundError,
  PlanPrincipalTooLowError,
} from "./advancePlans.repository";
import {
  createPlanSchema,
  planListQuerySchema,
  recordRepaymentSchema,
  updatePlanSchema,
} from "./advancePlans.validators";
import { extractOtpFields, requireAdvanceOtp } from "./advances.otp";

/** Maps the repository's typed error classes onto the right HTTP status. */
function toApiError(err: unknown): ApiError | null {
  if (err instanceof PlanNotFoundError || err instanceof InstallmentNotFoundError) {
    return ApiError.notFound(err.message);
  }
  if (
    err instanceof PlanNotEditableError ||
    err instanceof PlanPrincipalTooLowError ||
    err instanceof CustomScheduleMismatchError ||
    err instanceof PlanHasPaymentsError
  ) {
    return ApiError.badRequest(err.message);
  }
  return null;
}

/** The overview table: one row per employee with an active plan. */
export const listSummaries = asyncHandler(async (_req: Request, res: Response) => {
  const summaries = await repo.listEmployeeAdvanceSummaries();
  res.json({ summaries });
});

/** Full plan history (any status) for one employee — the detail view. */
export const listPlansForEmployee = asyncHandler(async (req: Request, res: Response) => {
  const query = planListQuerySchema.parse(req.query);
  if (!query.employeeId) throw ApiError.badRequest("employeeId is required");
  const plans = await repo.listPlansForEmployee(query.employeeId);
  res.json({ plans });
});

export const getPlan = asyncHandler(async (req: Request, res: Response) => {
  const id = z.string().uuid().parse(req.params.id);
  const plan = await repo.getPlanById(id);
  if (!plan) throw ApiError.notFound("Advance plan not found");
  res.json({ plan });
});

export const createPlan = asyncHandler(async (req: Request, res: Response) => {
  const { otpChallengeId, otpCode, rest } = extractOtpFields(req.body);
  const input = createPlanSchema.parse(rest);

  if (!(await repo.employeeExists(input.employeeId))) {
    throw ApiError.badRequest("Employee not found");
  }

  await requireAdvanceOtp(req, "create", input.employeeId, otpChallengeId, otpCode);

  const plan = await repo.createPlan({
    employeeId: input.employeeId,
    principalAmount: input.principalAmount,
    startDate: input.startDate,
    planType: input.planType,
    installmentCount: input.installmentCount,
    installments: input.installments,
    note: input.note ?? null,
    createdBy: req.user!.id,
  });

  await logAudit(req, "advance.plan_create", "employee_advance_plan", plan.id, {
    employeeId: plan.employeeId,
    principalAmount: plan.principalAmount,
    planType: plan.planType,
    installmentCount: plan.installmentCount,
  });

  res.status(201).json({ plan });
});

export const updatePlan = asyncHandler(async (req: Request, res: Response) => {
  const id = z.string().uuid().parse(req.params.id);
  const { otpChallengeId, otpCode, rest } = extractOtpFields(req.body);
  const input = updatePlanSchema.parse(rest);

  const before = await repo.getPlanById(id);
  if (!before) throw ApiError.notFound("Advance plan not found");

  await requireAdvanceOtp(req, "edit", before.employeeId, otpChallengeId, otpCode);

  try {
    const plan = await repo.updatePlan(id, { ...input, updatedBy: req.user!.id });

    await logAudit(req, "advance.plan_update", "employee_advance_plan", plan.id, {
      employeeId: plan.employeeId,
      before: {
        principalAmount: before.principalAmount,
        planType: before.planType,
        installmentCount: before.installmentCount,
        keptInstallments: before.installments.filter((i) => i.paidAmount > 0).length,
      },
      after: {
        principalAmount: plan.principalAmount,
        planType: plan.planType,
        installmentCount: plan.installmentCount,
        status: plan.status,
      },
    });

    res.json({ plan });
  } catch (err) {
    const apiErr = toApiError(err);
    if (apiErr) throw apiErr;
    throw err;
  }
});

export const cancelPlan = asyncHandler(async (req: Request, res: Response) => {
  const id = z.string().uuid().parse(req.params.id);
  const { otpChallengeId, otpCode } = extractOtpFields(req.body);

  const before = await repo.getPlanById(id);
  if (!before) throw ApiError.notFound("Advance plan not found");

  await requireAdvanceOtp(req, "edit", before.employeeId, otpChallengeId, otpCode);

  try {
    const plan = await repo.cancelPlan(id);
    await logAudit(req, "advance.plan_cancel", "employee_advance_plan", plan.id, {
      employeeId: plan.employeeId,
    });
    res.json({ plan });
  } catch (err) {
    const apiErr = toApiError(err);
    if (apiErr) throw apiErr;
    throw err;
  }
});

export const deletePlan = asyncHandler(async (req: Request, res: Response) => {
  const id = z.string().uuid().parse(req.params.id);
  const { otpChallengeId, otpCode } = extractOtpFields(req.body);

  const before = await repo.getPlanById(id);
  if (!before) throw ApiError.notFound("Advance plan not found");

  await requireAdvanceOtp(req, "delete", before.employeeId, otpChallengeId, otpCode);

  try {
    await repo.deletePlanIfUnpaid(id);
    await logAudit(req, "advance.plan_delete", "employee_advance_plan", id, {
      employeeId: before.employeeId,
      principalAmount: before.principalAmount,
    });
    res.json({ success: true });
  } catch (err) {
    const apiErr = toApiError(err);
    if (apiErr) throw apiErr;
    throw err;
  }
});

export const recordRepayment = asyncHandler(async (req: Request, res: Response) => {
  const { otpChallengeId, otpCode, rest } = extractOtpFields(req.body);
  const input = recordRepaymentSchema.parse(rest);

  const employeeId = await repo.findEmployeeIdForInstallment(input.installmentId);
  if (!employeeId) throw ApiError.notFound("Installment not found");

  await requireAdvanceOtp(req, "create", employeeId, otpChallengeId, otpCode);

  try {
    const { plan, installment } = await repo.recordRepayment({
      installmentId: input.installmentId,
      amount: input.amount,
      entryDate: input.entryDate,
      note: input.note ?? null,
      createdBy: req.user!.id,
    });

    await logAudit(req, "advance.plan_repayment", "employee_advance_plan", plan.id, {
      employeeId: plan.employeeId,
      installmentId: installment.id,
      installmentNo: installment.installmentNo,
      amount: input.amount,
      entryDate: input.entryDate,
      planStatus: plan.status,
    });

    res.status(201).json({ plan, installment });
  } catch (err) {
    const apiErr = toApiError(err);
    if (apiErr) throw apiErr;
    throw err;
  }
});
