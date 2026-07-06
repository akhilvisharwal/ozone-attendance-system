import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { env } from "../../config/env";
import { JwtAccessPayload, JwtRefreshPayload, Role } from "../../types";

import { getSessionTimeoutMinutes } from "../../utils/settingsHelpers";

export function signAccessToken(payload: { id: string; employeeCode: string; role: Role }): string {
  const body: JwtAccessPayload = {
    sub: payload.id,
    employeeCode: payload.employeeCode,
    role: payload.role,
    tokenType: "access",
  };
  const expiresIn = `${getSessionTimeoutMinutes()}m` as jwt.SignOptions["expiresIn"];
  return jwt.sign(body, env.jwtAccessSecret, { expiresIn });
}

export function verifyAccessToken(token: string): JwtAccessPayload {
  return jwt.verify(token, env.jwtAccessSecret) as JwtAccessPayload;
}

export function signRefreshToken(employeeId: string): { token: string; jti: string } {
  const jti = uuidv4();
  const body: JwtRefreshPayload = { sub: employeeId, tokenType: "refresh", jti };
  const token = jwt.sign(body, env.jwtRefreshSecret, { expiresIn: env.jwtRefreshExpiresIn as any });
  return { token, jti };
}

export function verifyRefreshToken(token: string): JwtRefreshPayload {
  return jwt.verify(token, env.jwtRefreshSecret) as JwtRefreshPayload;
}
