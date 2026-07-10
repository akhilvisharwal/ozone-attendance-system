import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { Logo } from "@/components/Logo";
import { SYSTEM_NAME } from "@/config/branding";
import { extractErrorMessage } from "@/api/client";
import * as emailApi from "@/api/emailVerification";

export function ForgotPasswordPage() {
  const [employeeId, setEmployeeId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const result = await emailApi.forgotAdminPassword(employeeId.trim().toUpperCase());
      setSuccess(result.message);
    } catch (err) {
      setError(extractErrorMessage(err, "Could not send password reset email."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 px-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-sm rounded-2xl border border-slate-200/80 bg-white p-8 shadow-soft-lg"
      >
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Logo variant="hero" interactive={false} />
          <p className="text-sm text-slate-500">{SYSTEM_NAME}</p>
          <h1 className="text-lg font-semibold text-slate-900">Forgot password</h1>
          <p className="text-sm text-slate-500">
            Enter the System Admin employee ID. A reset link will be sent to the administrator email.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && <Alert variant="error">{error}</Alert>}
          {success && <Alert variant="success">{success}</Alert>}

          <Input
            label="System Admin Employee ID"
            placeholder="e.g. OZNADMIN"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            autoComplete="username"
            required
          />

          <Button type="submit" isLoading={submitting} className="w-full">
            Send reset link
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-500">
          <Link to="/login" className="font-medium text-brand-700 hover:underline">
            Back to sign in
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
