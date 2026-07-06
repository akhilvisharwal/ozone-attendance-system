import { Navigate, Outlet } from "react-router-dom";
import type { Role } from "@/types";
import { useAuth } from "./AuthContext";
import { LoadingScreen } from "@/components/LoadingScreen";

export function ProtectedRoute({ allowedRoles }: { allowedRoles: Role[] }) {
  const { employee, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!employee) {
    return <Navigate to="/login" replace />;
  }

  if (!allowedRoles.includes(employee.role)) {
    return <Navigate to={employee.role === "admin" ? "/admin" : "/"} replace />;
  }

  return <Outlet />;
}
