import { Request } from "express";
import { ApiError } from "../../utils/errors";
import { requestOtpChallenge, requireVerifiedOtp } from "../emailVerification/emailVerification.service";
import type { OtpPurpose } from "../emailVerification/emailVerification.repository";
import * as employeesRepo from "../employees/employees.repository";

export type AdvanceOtpAction = "create" | "edit" | "delete";

const ACTION_PURPOSE: Record<AdvanceOtpAction, OtpPurpose> = {
  create: "advance_create",
  edit: "advance_edit",
  delete: "advance_delete",
};

/**
 * Step 1: request a code. Requested via the advances module's own route
 * (gated the same way as every advance mutation — manageAdvances, so Junior
 * Admins can request codes too, unlike the generic master-admin-only
 * POST /otp/request). The employee's name/code come from the database, not
 * the client, so the email's context line can't be spoofed.
 */
export async function requestAdvanceOtp(
  req: Request,
  action: AdvanceOtpAction,
  employeeId: string
): Promise<{ challengeId: string; expiresAt: string; maskedEmail: string }> {
  const employee = await employeesRepo.findEmployeeById(employeeId);
  if (!employee) throw ApiError.badRequest("Employee not found");

  return requestOtpChallenge({
    req,
    purpose: ACTION_PURPOSE[action],
    actorId: req.user!.id,
    payload: { employeeId, action },
    contextLine: `Employee: ${employee.name} (${employee.employee_code})`,
  });
}

/**
 * Step 2: verify the code immediately before the mutation runs. Also checks
 * the verified challenge's stored employeeId against the employee this
 * specific mutation actually targets, so a code requested for one employee
 * can't be reused to authorize a mutation on a different one.
 */
export async function requireAdvanceOtp(
  req: Request,
  action: AdvanceOtpAction,
  employeeId: string,
  otpChallengeId: string | undefined,
  otpCode: string | undefined
): Promise<void> {
  const payload = await requireVerifiedOtp({
    req,
    purpose: ACTION_PURPOSE[action],
    otpChallengeId,
    otpCode,
  });
  if (payload.employeeId && payload.employeeId !== employeeId) {
    throw ApiError.badRequest(
      "This verification code was issued for a different employee. Request a new code."
    );
  }
}

/** Pulls otpChallengeId/otpCode out of a raw request body without requiring every mutation schema to know about them. */
export function extractOtpFields(body: unknown): {
  otpChallengeId: string | undefined;
  otpCode: string | undefined;
  rest: Record<string, unknown>;
} {
  const source = (body ?? {}) as Record<string, unknown>;
  const otpChallengeId = typeof source.otpChallengeId === "string" ? source.otpChallengeId : undefined;
  const otpCode = typeof source.otpCode === "string" ? source.otpCode : undefined;
  const { otpChallengeId: _a, otpCode: _b, ...rest } = source;
  return { otpChallengeId, otpCode, rest };
}
