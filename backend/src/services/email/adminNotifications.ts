import { Request } from "express";
import { sendAdminNotificationEmail } from "./email.service";
import { logAudit } from "../../modules/audit/audit.repository";

/** Fire-and-forget admin notification email (never blocks the main request on failure). */
export async function notifyAdminEvent(input: {
  req: Request;
  subject: string;
  title: string;
  lines: string[];
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const result = await sendAdminNotificationEmail({
      subject: input.subject,
      title: input.title,
      lines: input.lines,
    });
    await logAudit(input.req, "email.notification_sent", input.targetType, input.targetId, {
      subject: input.subject,
      ok: result.ok,
      skipped: Boolean(result.skipped),
      error: result.error,
      ...input.metadata,
    });
  } catch (err) {
    console.error("[email-notification] Failed:", err instanceof Error ? err.message : err);
  }
}
