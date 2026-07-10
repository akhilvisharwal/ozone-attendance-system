import { Navigate, Outlet } from "react-router-dom";
import { usePermissions } from "./usePermissions";
import type { AdminPermission } from "./permissions";

/** Guards an admin route by required permission(s). Master Admin always passes. */
export function PermissionRoute({
  anyOf,
  allOf,
}: {
  anyOf?: AdminPermission[];
  allOf?: AdminPermission[];
}) {
  const { isMasterAdmin, canAny, canAll, homePath } = usePermissions();

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
  const { isMasterAdmin, homePath } = usePermissions();

  if (!isMasterAdmin) return <Navigate to={homePath} replace />;
  return <Outlet />;
}
