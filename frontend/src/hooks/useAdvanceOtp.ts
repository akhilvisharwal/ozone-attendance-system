import { useCallback, useState } from "react";
import * as advancePlansApi from "@/api/advancePlans";
import type { AdvanceOtpAction, AdvanceOtpFields } from "@/api/advancePlans";
import type { OtpPurpose } from "@/api/emailVerification";

const ACTION_PURPOSE: Record<AdvanceOtpAction, OtpPurpose> = {
  create: "advance_create",
  edit: "advance_edit",
  delete: "advance_delete",
};

/**
 * Shared OTP orchestration for every advance create/edit/delete flow —
 * mirrors JuniorAdminSettingsSection's proactive pattern (submit defers the
 * real mutation, opens the code-entry step, and only runs the mutation once
 * verified) rather than a reactive "catch a verification-required error"
 * pattern, since these mutations always require a code, not conditionally.
 *
 * Each component using this renders exactly one <EmailOtpModal> wired to
 * `purpose`/`requestFn`/`onVerified`/`close`, and calls `runWithOtp` instead
 * of calling the advancePlans API directly.
 */
export function useAdvanceOtp() {
  const [action, setAction] = useState<AdvanceOtpAction | null>(null);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [pendingRun, setPendingRun] = useState<
    ((otp: AdvanceOtpFields) => Promise<void>) | null
  >(null);

  const purpose = action ? ACTION_PURPOSE[action] : null;

  const runWithOtp = useCallback(
    (forAction: AdvanceOtpAction, forEmployeeId: string, run: (otp: AdvanceOtpFields) => Promise<void>) => {
      setAction(forAction);
      setEmployeeId(forEmployeeId);
      // Wrap in a function so React's setState doesn't treat `run` as an updater.
      setPendingRun(() => run);
    },
    []
  );

  const close = useCallback(() => {
    setAction(null);
    setEmployeeId(null);
    setPendingRun(null);
  }, []);

  const requestFn = useCallback(() => {
    if (!action || !employeeId) {
      return Promise.reject(new Error("No pending advance action."));
    }
    return advancePlansApi.requestAdvanceOtp(action, employeeId);
  }, [action, employeeId]);

  const onVerified = useCallback(
    async (otp: AdvanceOtpFields) => {
      if (!pendingRun) return;
      await pendingRun(otp);
      close();
    },
    [pendingRun, close]
  );

  return {
    /** Pass to <EmailOtpModal open={purpose !== null} purpose={purpose} .../>. */
    purpose,
    requestFn,
    onVerified,
    close,
    /** Call instead of the advancePlans API directly — opens the OTP step first. */
    runWithOtp,
  };
}
