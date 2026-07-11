import { useState } from "react";
import type { FormEvent } from "react";
import { Navigate, useNavigate, Link } from "react-router-dom";
import { motion } from "motion/react";
import { useAuth } from "@/auth/AuthContext";
import { usePermissions } from "@/auth/usePermissions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { Logo } from "@/components/Logo";
import { SYSTEM_NAME } from "@/config/branding";
import { extractErrorMessage } from "@/api/client";
import { firstAllowedAdminPath, normalizePermissions } from "@/auth/permissions";

export function LoginPage() {
  const { employee, isBootstrapping, login } = useAuth();
  const { homePath } = usePermissions();
  const navigate = useNavigate();
  const [employeeId, setEmployeeId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Sessions are never restored across reloads — only an in-memory login can set employee.
  if (isBootstrapping) {
    return null;
  }

  if (employee) {
    return <Navigate to={homePath} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const loggedInEmployee = await login(employeeId.trim().toUpperCase(), password);
      const dest =
        loggedInEmployee.role === "employee"
          ? "/"
          : loggedInEmployee.role === "admin"
            ? "/admin"
            : firstAllowedAdminPath(normalizePermissions(loggedInEmployee.admin_permissions));
      navigate(dest, { replace: true });
    } catch (err) {
      setError(extractErrorMessage(err, "Invalid employee ID or password"));
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
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && <Alert variant="error">{error}</Alert>}

          <Input
            label="Employee ID"
            placeholder="e.g. OZN001"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            autoComplete="username"
            required
          />
          <Input
            label="Password"
            type="password"
            placeholder="Your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />

          <Button type="submit" isLoading={submitting} className="mt-2 w-full">
            Sign In
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-400">
          System Admin?{" "}
          <Link to="/forgot-password" className="font-medium text-brand-700 hover:underline">
            Forgot password
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
