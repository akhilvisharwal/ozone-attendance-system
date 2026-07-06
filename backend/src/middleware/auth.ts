import { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/errors";
import { verifyAccessToken } from "../modules/auth/jwt";
import { Role } from "../types";

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
  } catch (err) {
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
