import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/errors";
import { env } from "../../config/env";
import { parseDurationMs } from "../../utils/duration";
import { loginSchema } from "./auth.validators";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "./jwt";
import { storeRefreshToken, isRefreshTokenValid, revokeRefreshToken } from "./auth.repository";
import { findEmployeeByCode, findEmployeeById, toPublicEmployee } from "../employees/employees.repository";
import { clearLoginAttempts, isLoginLocked, recordFailedLogin } from "../../utils/loginAttempts";
import { logAudit } from "../audit/audit.repository";

const REFRESH_COOKIE = "refreshToken";

function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: (env.isProduction ? "none" : "lax") as "none" | "lax",
    path: "/api/auth",
    maxAge: parseDurationMs(env.jwtRefreshExpiresIn),
  };
}

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { employeeId, password } = loginSchema.parse(req.body);
  const code = employeeId.trim().toUpperCase();

  if (isLoginLocked(code)) {
    throw ApiError.forbidden("Too many failed login attempts. Please try again in 15 minutes.");
  }

  const employee = await findEmployeeByCode(code);

  const genericError = () => ApiError.unauthorized("Invalid employee ID or password");

  if (!employee) {
    recordFailedLogin(code);
    throw genericError();
  }
  if (!employee.is_active) throw ApiError.forbidden("This account has been deactivated. Contact your administrator.");

  const passwordMatches = await bcrypt.compare(password.trim(), employee.password_hash);
  if (!passwordMatches) {
    const { locked, remaining } = recordFailedLogin(code);
    if (locked) {
      throw ApiError.forbidden("Too many failed login attempts. Please try again in 15 minutes.");
    }
    throw ApiError.unauthorized(
      remaining > 0
        ? `Invalid employee ID or password. ${remaining} attempt(s) remaining.`
        : "Invalid employee ID or password"
    );
  }

  clearLoginAttempts(code);

  const accessToken = signAccessToken({ id: employee.id, employeeCode: employee.employee_code, role: employee.role });
  const { token: refreshToken } = signRefreshToken(employee.id);

  const expiresAt = new Date(Date.now() + parseDurationMs(env.jwtRefreshExpiresIn));
  await storeRefreshToken(employee.id, refreshToken, expiresAt);

  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
  await logAudit(req, "auth.login", "employee", employee.id);

  res.json({
    accessToken,
    employee: toPublicEmployee(employee),
  });
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) throw ApiError.unauthorized("No refresh token provided");

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    throw ApiError.unauthorized("Invalid or expired session, please log in again");
  }

  const valid = await isRefreshTokenValid(payload.sub, token);
  if (!valid) throw ApiError.unauthorized("Invalid or expired session, please log in again");

  const employee = await findEmployeeById(payload.sub);
  if (!employee || !employee.is_active) throw ApiError.unauthorized("Account is not available");

  const accessToken = signAccessToken({ id: employee.id, employeeCode: employee.employee_code, role: employee.role });
  res.json({ accessToken, employee: toPublicEmployee(employee) });
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (token) {
    try {
      const payload = verifyRefreshToken(token);
      await revokeRefreshToken(payload.sub, token);
    } catch {
      // token already invalid; nothing to revoke
    }
  }
  res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
  res.json({ message: "Logged out" });
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  const employee = await findEmployeeById(req.user!.id);
  if (!employee) throw ApiError.notFound("Employee not found");
  res.json({ employee: toPublicEmployee(employee) });
});
