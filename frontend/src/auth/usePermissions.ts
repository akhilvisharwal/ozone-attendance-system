import { useMemo } from "react";
import { useAuth } from "@/auth/AuthContext";
import {
  emptyPermissions,
  firstAllowedAdminPath,
  fullPermissions,
  normalizePermissions,
  type AdminPermission,
  type AdminPermissions,
} from "@/auth/permissions";

export function usePermissions() {
  const { employee } = useAuth();

  const isMasterAdmin = employee?.role === "admin";
  const isJuniorAdmin = employee?.role === "junior_admin";
  const isAdminPanel = isMasterAdmin || isJuniorAdmin;

  const permissions: AdminPermissions = useMemo(() => {
    if (!employee) return emptyPermissions();
    if (employee.role === "admin") return fullPermissions();
    if (employee.role === "junior_admin") return normalizePermissions(employee.admin_permissions);
    return emptyPermissions();
  }, [employee]);

  function can(permission: AdminPermission): boolean {
    if (isMasterAdmin) return true;
    return Boolean(permissions[permission]);
  }

  function canAny(...keys: AdminPermission[]): boolean {
    if (isMasterAdmin) return true;
    return keys.some((key) => Boolean(permissions[key]));
  }

  function canAll(...keys: AdminPermission[]): boolean {
    if (isMasterAdmin) return true;
    return keys.every((key) => Boolean(permissions[key]));
  }

  const homePath = useMemo(() => {
    if (!employee) return "/login";
    if (employee.role === "employee") return "/";
    if (employee.role === "admin") return "/admin";
    return firstAllowedAdminPath(permissions);
  }, [employee, permissions]);

  return {
    isMasterAdmin,
    isJuniorAdmin,
    isAdminPanel,
    permissions,
    can,
    canAny,
    canAll,
    homePath,
  };
}
