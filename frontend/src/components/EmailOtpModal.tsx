import { useEffect, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Modal, ModalFooterActions } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { extractErrorMessage } from "@/api/client";
import * as emailApi from "@/api/emailVerification";
import type { OtpPurpose } from "@/api/emailVerification";

const PURPOSE_COPY: Record<OtpPurpose, { title: string; description: string }> = {
  admin_password_change: {
    title: "Verify password change",
    description: "Enter the 6-digit code sent to the administrator email to change the System Admin password.",
  },
  database_cleanup: {
    title: "Verify database cleanup",
    description: "Enter the 6-digit code sent to the administrator email to permanently delete records.",
  },
  company_email_change: {
    title: "Verify company email change",
    description: "Enter the 6-digit code sent to the administrator email to update the company email address.",
  },
  company_phone_change: {
    title: "Verify company mobile change",
    description: "Enter the 6-digit code sent to the administrator email to update the company mobile number.",
  },
  junior_admin_create: {
    title: "Verify Junior Admin creation",
    description: "Enter the 6-digit code sent to the administrator email to create this Junior Admin account.",
  },
  junior_admin_delete: {
    title: "Verify Junior Admin deletion",
    description: "Enter the 6-digit code sent to the administrator email to delete this Junior Admin account.",
  },
  employee_delete: {
    title: "Verify employee deletion",
    description: "Enter the 6-digit code sent to the administrator email to delete this employee account.",
  },
  database_reset_step1: {
    title: "Verify database reset — step 1 of 2",
    description:
      "Enter the first 6-digit code sent to the administrator email. A second verification will be required before anything is deleted.",
  },
  database_reset_step2: {
    title: "Verify database reset — step 2 of 2",
    description:
      "Enter the second 6-digit code sent to the administrator email to permanently reset the database. This cannot be undone.",
  },
};

export function EmailOtpModal({
  open,
  purpose,
  onClose,
  onVerified,
  dismissible = true,
}: {
  open: boolean;
  purpose: OtpPurpose | null;
  onClose: () => void;
  onVerified: (otp: { otpChallengeId: string; otpCode: string }) => void | Promise<void>;
  /** When false, cancel/backdrop/Escape cannot close the modal (used while a destructive action runs). */
  dismissible?: boolean;
}) {
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [maskedEmail, setMaskedEmail] = useState("");
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const sendGenerationRef = useRef(0);
  const submittingRef = useRef(false);
  const activeKeyRef = useRef<string | null>(null);

  const copy = purpose ? PURPOSE_COPY[purpose] : null;
  const busy = sending || submitting || !dismissible;

  async function sendCode(force = false) {
    if (!purpose) return;
    if (sending && !force) return;

    const generation = ++sendGenerationRef.current;
    setSending(true);
    setError(null);
    try {
      const result = await emailApi.requestEmailOtp(purpose);
      // Ignore stale responses from an older open/resend cycle (Strict Mode / remount).
      if (generation !== sendGenerationRef.current) return;
      setChallengeId(result.challengeId);
      setMaskedEmail(result.maskedEmail);
      setExpiresAt(result.expiresAt);
      setCode("");
    } catch (err) {
      if (generation !== sendGenerationRef.current) return;
      setError(extractErrorMessage(err, "Could not send verification code."));
    } finally {
      if (generation === sendGenerationRef.current) {
        setSending(false);
      }
    }
  }

  useEffect(() => {
    if (!open || !purpose) {
      sendGenerationRef.current += 1;
      activeKeyRef.current = null;
      setChallengeId(null);
      setMaskedEmail("");
      setExpiresAt(null);
      setCode("");
      setError(null);
      setSending(false);
      setSubmitting(false);
      submittingRef.current = false;
      return;
    }

    const key = `${purpose}:${open}`;
    if (activeKeyRef.current === key) return;
    activeKeyRef.current = key;
    void sendCode(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, purpose]);

  async function handleSubmit() {
    if (submittingRef.current || !dismissible) return;
    if (!challengeId) {
      setError("Request a verification code first.");
      return;
    }
    if (!/^\d{6}$/.test(code.trim())) {
      setError("Enter the 6-digit verification code.");
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await onVerified({ otpChallengeId: challengeId, otpCode: code.trim() });
    } catch (err) {
      const message = extractErrorMessage(err, "Verification failed.");
      setError(message);
      // Used/expired codes cannot be retried — automatically issue a fresh challenge.
      if (/already been used|expired|request a new/i.test(message)) {
        void sendCode(true);
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  function handleClose() {
    if (!dismissible || submittingRef.current) return;
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={copy?.title ?? "Email verification"}
      description={copy?.description}
      widthClassName="max-w-md"
      showCloseButton={dismissible && !submitting}
      footer={
        <ModalFooterActions>
          <Button type="button" variant="outline" onClick={handleClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void sendCode(true)}
            isLoading={sending}
            disabled={busy && !sending}
          >
            Resend code
          </Button>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            isLoading={submitting || !dismissible}
            disabled={sending || (!dismissible && !submitting)}
          >
            Verify & continue
          </Button>
        </ModalFooterActions>
      }
    >
      <div className="space-y-4">
        {error && <Alert variant="error">{error}</Alert>}

        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
            <div>
              {maskedEmail ? (
                <p>
                  Code sent to <span className="font-medium text-slate-800">{maskedEmail}</span>
                </p>
              ) : (
                <p>Sending verification code…</p>
              )}
              {expiresAt && (
                <p className="mt-1 text-xs text-slate-500">
                  Expires at {new Date(expiresAt).toLocaleTimeString()} (5 minutes). One-time use only.
                </p>
              )}
            </div>
          </div>
        </div>

        <Input
          label="Verification code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="6-digit code"
          value={code}
          disabled={!dismissible}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        />
      </div>
    </Modal>
  );
}
