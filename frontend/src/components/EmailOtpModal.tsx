import { useEffect, useState } from "react";
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
};

export function EmailOtpModal({
  open,
  purpose,
  onClose,
  onVerified,
}: {
  open: boolean;
  purpose: OtpPurpose | null;
  onClose: () => void;
  onVerified: (otp: { otpChallengeId: string; otpCode: string }) => void | Promise<void>;
}) {
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [maskedEmail, setMaskedEmail] = useState("");
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const copy = purpose ? PURPOSE_COPY[purpose] : null;

  async function sendCode() {
    if (!purpose) return;
    setSending(true);
    setError(null);
    try {
      const result = await emailApi.requestEmailOtp(purpose);
      setChallengeId(result.challengeId);
      setMaskedEmail(result.maskedEmail);
      setExpiresAt(result.expiresAt);
      setCode("");
    } catch (err) {
      setError(extractErrorMessage(err, "Could not send verification code."));
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    if (!open || !purpose) {
      setChallengeId(null);
      setMaskedEmail("");
      setExpiresAt(null);
      setCode("");
      setError(null);
      return;
    }
    void sendCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, purpose]);

  async function handleSubmit() {
    if (!challengeId) {
      setError("Request a verification code first.");
      return;
    }
    if (!/^\d{6}$/.test(code.trim())) {
      setError("Enter the 6-digit verification code.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onVerified({ otpChallengeId: challengeId, otpCode: code.trim() });
    } catch (err) {
      setError(extractErrorMessage(err, "Verification failed."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={copy?.title ?? "Email verification"}
      description={copy?.description}
      widthClassName="max-w-md"
      footer={
        <ModalFooterActions>
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" variant="outline" onClick={() => void sendCode()} isLoading={sending} disabled={submitting}>
            Resend code
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} isLoading={submitting} disabled={sending}>
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
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        />
      </div>
    </Modal>
  );
}
