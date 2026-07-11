import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "motion/react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { Logo } from "@/components/Logo";
import { SYSTEM_NAME } from "@/config/branding";
import { extractErrorMessage } from "@/api/client";
import * as emailApi from "@/api/emailVerification";

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = useMemo(() => params.get("token")?.trim() ?? "", [params]);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!token) {
      setError("This reset link is missing a token. Request a new password reset.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await emailApi.resetAdminPassword({
        token,
        newPassword,
        confirmPassword,
      });
      setSuccess(result.message);
      setTimeout(() => navigate("/login", { replace: true }), 1500);
    } catch (err) {
      setError(extractErrorMessage(err, "Could not reset password."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-sm rounded-2xl border border-slate-200/80 bg-white p-5 shadow-soft-lg sm:p-8"
      >
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Logo variant="hero" interactive={false} />
          <p className="text-sm text-slate-500">{SYSTEM_NAME}</p>
          <h1 className="text-lg font-semibold text-slate-900">Reset password</h1>
          <p className="text-sm text-slate-500">Choose a new password for the System Admin account.</p>
        </div>

        {!token ? (
          <Alert variant="error">
            Invalid reset link.{" "}
            <Link to="/forgot-password" className="font-medium underline">
              Request a new one
            </Link>
            .
          </Alert>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {error && <Alert variant="error">{error}</Alert>}
            {success && <Alert variant="success">{success}</Alert>}

            <Input
              label="New password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
            <Input
              label="Confirm new password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
            />

            <Button type="submit" isLoading={submitting} className="w-full" disabled={Boolean(success)}>
              Update password
            </Button>
          </form>
        )}

        <p className="mt-4 text-center text-sm text-slate-500">
          <Link
            to="/login"
            className="inline-flex min-h-11 items-center font-medium text-brand-700 hover:underline sm:min-h-0"
          >
            Back to sign in
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
