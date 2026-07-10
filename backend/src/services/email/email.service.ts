import { Resend } from "resend";
import { env } from "../../config/env";

let resendClient: Resend | null = null;

function getResend(): Resend | null {
  if (!env.resendApiKey.trim()) return null;
  if (!resendClient) resendClient = new Resend(env.resendApiKey);
  return resendClient;
}

export function isEmailConfigured(): boolean {
  return Boolean(env.resendApiKey.trim() && env.emailFrom.trim());
}

export function getAdminNotificationEmail(): string {
  return env.notificationAdminEmail.trim().toLowerCase();
}

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
};

export type SendEmailResult = {
  ok: boolean;
  id?: string;
  skipped?: boolean;
  error?: string;
};

/** Sends transactional email via Resend. Skips (does not throw) when API key is unset in non-production. */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const client = getResend();
  if (!client) {
    if (env.isProduction) {
      return { ok: false, error: "Email is not configured (RESEND_API_KEY missing)" };
    }
    console.info("[email] Skipped (RESEND_API_KEY unset):", {
      to: input.to,
      subject: input.subject,
    });
    return { ok: true, skipped: true };
  }

  try {
    const result = await client.emails.send({
      from: env.emailFrom,
      to: Array.isArray(input.to) ? input.to : [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    });

    if (result.error) {
      console.error("[email] Resend error:", result.error);
      return { ok: false, error: result.error.message };
    }

    return { ok: true, id: result.data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send email";
    console.error("[email] Send failed:", message);
    return { ok: false, error: message };
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function layout(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
        <tr><td style="padding:24px 28px;background:#0f172a;color:#ffffff;">
          <div style="font-size:18px;font-weight:700;">Ozone Aircon</div>
          <div style="font-size:13px;opacity:0.8;margin-top:4px;">Attendance Management System</div>
        </td></tr>
        <tr><td style="padding:28px;">
          <h1 style="margin:0 0 16px;font-size:20px;font-weight:700;">${escapeHtml(title)}</h1>
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;">
          This is an automated message. Do not reply to this email.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendOtpEmail(input: {
  to: string;
  code: string;
  purposeLabel: string;
  expiresMinutes: number;
}): Promise<SendEmailResult> {
  const subject = `Security code: ${input.purposeLabel}`;
  const html = layout(
    "Email verification code",
    `<p style="margin:0 0 12px;line-height:1.5;">Use this one-time code to confirm: <strong>${escapeHtml(input.purposeLabel)}</strong>.</p>
     <p style="margin:20px 0;font-size:32px;letter-spacing:8px;font-weight:700;text-align:center;color:#0f172a;">${escapeHtml(input.code)}</p>
     <p style="margin:0;line-height:1.5;color:#475569;">This code expires in ${input.expiresMinutes} minutes and can be used only once. If you did not request this, ignore this email and review recent admin activity.</p>`
  );
  const text = `Your Ozone Aircon security code for ${input.purposeLabel} is ${input.code}. It expires in ${input.expiresMinutes} minutes.`;
  return sendEmail({ to: input.to, subject, html, text });
}

export async function sendPasswordResetEmail(input: {
  to: string;
  resetUrl: string;
  expiresMinutes: number;
}): Promise<SendEmailResult> {
  const subject = "Reset System Admin password";
  const html = layout(
    "Password reset request",
    `<p style="margin:0 0 16px;line-height:1.5;">A password reset was requested for the System Admin account.</p>
     <p style="margin:0 0 20px;text-align:center;">
       <a href="${escapeHtml(input.resetUrl)}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;">Reset password</a>
     </p>
     <p style="margin:0 0 12px;line-height:1.5;color:#475569;word-break:break-all;">Or open this link:<br>${escapeHtml(input.resetUrl)}</p>
     <p style="margin:0;line-height:1.5;color:#475569;">This link expires in ${input.expiresMinutes} minutes and can be used only once. If you did not request a reset, ignore this email.</p>`
  );
  const text = `Reset your System Admin password: ${input.resetUrl}\nThis link expires in ${input.expiresMinutes} minutes.`;
  return sendEmail({ to: input.to, subject, html, text });
}

export async function sendAdminNotificationEmail(input: {
  subject: string;
  title: string;
  lines: string[];
}): Promise<SendEmailResult> {
  const body = input.lines
    .map((line) => `<p style="margin:0 0 10px;line-height:1.5;">${escapeHtml(line)}</p>`)
    .join("");
  const html = layout(input.title, body);
  const text = [input.title, ...input.lines].join("\n");
  return sendEmail({
    to: getAdminNotificationEmail(),
    subject: input.subject,
    html,
    text,
  });
}
