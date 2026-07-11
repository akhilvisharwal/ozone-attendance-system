import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getOtpReceiverEmail } from "../../services/email/email.service";
import { env } from "../../config/env";

describe("OTP_RECEIVER_EMAIL", () => {
  it("reads the configured OTP receiver from env without falling back to ADMIN_EMAIL", () => {
    const configured = env.otpReceiverEmail.trim().toLowerCase();
    const admin = env.adminEmail.trim().toLowerCase();
    const recipient = getOtpReceiverEmail();

    if (!configured) {
      assert.equal(recipient, null);
      // Missing OTP_RECEIVER_EMAIL must not silently use ADMIN_EMAIL.
      assert.notEqual(admin, "");
    } else {
      assert.equal(recipient, configured);
    }
  });
});
