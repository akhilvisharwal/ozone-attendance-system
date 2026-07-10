import { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/errors";
import { verifyAccessToken } from "../modules/auth/jwt";
import { Role } from "../types";
import type { AdminPermission } from "../modules/auth/permissions";
import { fullPermissions, normalizePermissions } from "../modules/auth/permissions";
import { getEmployeePermissions } from "../modules/employees/employees.repository";

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return next(ApiError.unauthorized("Missing or invalid authorization header"));
  }

  const token = header.slice("Bearer ".length);

  try {
    const payload = verifyAccessToken(token);
    if (payload.tokenType !== "access") {
      return next(ApiError.unauthorized("Invalid token type"));
    }
    req.user = {
      id: payload.sub,
      employeeCode: payload.employeeCode,
      role: payload.role,
    };
    next();
  } catch {
    return next(ApiError.unauthorized("Invalid or expired token"));
  }
}

/**
 * Restricts access to the given roles. Must be used after requireAuth.
 * All authorization decisions are enforced here on the server — the client
 * cannot bypass this by changing routes or request parameters.
 */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(ApiError.unauthorized());
    }
    if (!roles.includes(req.user.role)) {
      return next(ApiError.forbidden("You do not have permission to perform this action"));
    }
    next();
  };
}

/** Master Admin only — Settings, Security, Database, Holidays config, etc. */
export function requireMasterAdmin() {
  return requireRole("admin");
}

/** Any admin panel user (Master or Junior). Pair with requirePermission for fine-grained checks. */
export function requireAdminPanel() {
  return requireRole("admin", "junior_admin");
}

async function ensurePermissionsLoaded(req: Request): Promise<void> {
  if (!req.user) return;
  if (req.user.role === "admin") {
    req.user.permissions = fullPermissions();
    return;
  }
  if (req.user.role !== "junior_admin") {
    req.user.permissions = undefined;
    return;
  }
  if (req.user.permissions) return;
  const raw = await getEmployeePermissions(req.user.id);
  req.user.permissions = normalizePermissions(raw);
}

/**
 * Master Admin always passes. Junior Admin must have every listed permission enabled.
 * Must be used after requireAuth (and typically after requireAdminPanel).
 */
export function requirePermission(...keys: AdminPermission[]) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return next(ApiError.unauthorized());
      }
      if (req.user.role === "admin") {
        req.user.permissions = fullPermissions();
        return next();
      }
      if (req.user.role !== "junior_admin") {
        return next(ApiError.forbidden("You do not have permission to perform this action"));
      }
      await ensurePermissionsLoaded(req);
      const missing = keys.filter((key) => !req.user!.permissions?.[key]);
      if (missing.length > 0) {
        return next(ApiError.forbidden("You do not have permission to perform this action"));
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Junior Admin passes if any of the listed permissions is enabled. */
export function requireAnyPermission(...keys: AdminPermission[]) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return next(ApiError.unauthorized());
      }
      if (req.user.role === "admin") {
        req.user.permissions = fullPermissions();
        return next();
      }
      if (req.user.role !== "junior_admin") {
        return next(ApiError.forbidden("You do not have permission to perform this action"));
      }
      await ensurePermissionsLoaded(req);
      const allowed = keys.some((key) => Boolean(req.user!.permissions?.[key]));
      if (!allowed) {
        return next(ApiError.forbidden("You do not have permission to perform this action"));
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
