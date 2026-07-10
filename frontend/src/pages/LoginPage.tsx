import { useState } from "react";
import type { FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { Logo } from "@/components/Logo";
import { SYSTEM_NAME } from "@/config/branding";
import { extractErrorMessage } from "@/api/client";

export function LoginPage() {
  const { employee, isLoading, login } = useAuth();
  const navigate = useNavigate();
  const [employeeId, setEmployeeId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!isLoading && employee) {
    return <Navigate to={employee.role === "admin" ? "/admin" : "/"} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const loggedInEmployee = await login(employeeId.trim().toUpperCase(), password);
      navigate(loggedInEmployee.role === "admin" ? "/admin" : "/", { replace: true });
    } catch (err) {
      setError(extractErrorMessage(err, "Invalid employee ID or password"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Logo variant="hero" />
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
          Forgot your password? Contact your administrator to reset it.
        </p>
      </div>
    </div>
  );
}
