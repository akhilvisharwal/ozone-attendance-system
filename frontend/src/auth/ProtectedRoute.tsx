import { Navigate, Outlet } from "react-router-dom";
import type { Role } from "@/types";
import { useAuth } from "./AuthContext";
import { usePermissions } from "./usePermissions";
import { ChangePasswordRequiredPage } from "@/pages/ChangePasswordRequiredPage";

export function ProtectedRoute({ allowedRoles }: { allowedRoles: Role[] }) {
  const { employee } = useAuth();
  const { homePath } = usePermissions();

  if (!employee) {
    return <Navigate to="/login" replace />;
  }

  if (!employee.first_login_completed) {
    return <ChangePasswordRequiredPage />;
  }

  if (!allowedRoles.includes(employee.role)) {
    return <Navigate to={homePath} replace />;
  }

  return <Outlet />;
}
