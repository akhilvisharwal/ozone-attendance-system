import { apiClient } from "./client";

export type OtpPurpose =
  | "admin_password_change"
  | "database_cleanup"
  | "company_email_change"
  | "company_phone_change";

export type OtpChallengeResponse = {
  challengeId: string;
  expiresAt: string;
  maskedEmail: string;
  message: string;
};

export async function requestEmailOtp(purpose: OtpPurpose): Promise<OtpChallengeResponse> {
  const res = await apiClient.post<OtpChallengeResponse>("/email-verification/otp/request", {
    purpose,
  });
  return res.data;
}

export async function forgotAdminPassword(employeeId: string): Promise<{
  success: boolean;
  message: string;
  maskedEmail: string;
}> {
  const res = await apiClient.post<{
    success: boolean;
    message: string;
    maskedEmail: string;
  }>("/auth/forgot-password", { employeeId });
  return res.data;
}

export async function resetAdminPassword(input: {
  token: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<{ success: boolean; message: string }> {
  const res = await apiClient.post<{ success: boolean; message: string }>(
    "/auth/reset-password",
    input
  );
  return res.data;
}
