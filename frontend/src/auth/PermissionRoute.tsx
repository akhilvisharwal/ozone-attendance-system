import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { usePermissions } from "./usePermissions";
import { LoadingScreen } from "@/components/LoadingScreen";
import type { AdminPermission } from "./permissions";

/** Guards an admin route by required permission(s). Master Admin always passes. */
export function PermissionRoute({
  anyOf,
  allOf,
}: {
  anyOf?: AdminPermission[];
  allOf?: AdminPermission[];
}) {
  const { isLoading } = useAuth();
  const { isMasterAdmin, canAny, canAll, homePath } = usePermissions();

  if (isLoading) return <LoadingScreen />;
  if (isMasterAdmin) return <Outlet />;

  if (allOf && allOf.length > 0 && !canAll(...allOf)) {
    return <Navigate to={homePath} replace />;
  }
  if (anyOf && anyOf.length > 0 && !canAny(...anyOf)) {
    return <Navigate to={homePath} replace />;
  }

  return <Outlet />;
}

/** Settings and other Master-Admin-only routes. */
export function MasterAdminRoute() {
  const { isLoading } = useAuth();
  const { isMasterAdmin, homePath } = usePermissions();

  if (isLoading) return <LoadingScreen />;
  if (!isMasterAdmin) return <Navigate to={homePath} replace />;
  return <Outlet />;
}
