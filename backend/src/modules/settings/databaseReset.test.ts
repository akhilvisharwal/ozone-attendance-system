import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  databaseResetExecuteSchema,
  databaseResetPrepareSchema,
} from "../settings/settings.validators";
import {
  OTP_PURPOSE_LABELS,
  REQUESTABLE_OTP_PURPOSES,
} from "../emailVerification/emailVerification.repository";

describe("database reset OTP schemas", () => {
  it("requires RESET confirmation and step-1 OTP to prepare", () => {
    const parsed = databaseResetPrepareSchema.parse({
      confirmation: "RESET",
      otpChallengeId: "11111111-1111-4111-8111-111111111111",
      otpCode: "123456",
    });
    assert.equal(parsed.confirmation, "RESET");
    assert.throws(() =>
      databaseResetPrepareSchema.parse({
        confirmation: "DELETE",
        otpChallengeId: "11111111-1111-4111-8111-111111111111",
        otpCode: "123456",
      })
    );
  });

  it("requires authorization ticket plus step-2 OTP to execute", () => {
    const parsed = databaseResetExecuteSchema.parse({
      confirmation: "RESET",
      authorizationId: "22222222-2222-4222-8222-222222222222",
      authorizationToken: "a".repeat(64),
      otpChallengeId: "33333333-3333-4333-8333-333333333333",
      otpCode: "654321",
    });
    assert.equal(parsed.otpCode, "654321");
    assert.throws(() =>
      databaseResetExecuteSchema.parse({
        confirmation: "RESET",
        authorizationId: "22222222-2222-4222-8222-222222222222",
        otpChallengeId: "33333333-3333-4333-8333-333333333333",
        otpCode: "654321",
      })
    );
  });

  it("exposes reset step purposes as requestable OTPs", () => {
    assert.ok(REQUESTABLE_OTP_PURPOSES.includes("database_reset_step1"));
    assert.ok(REQUESTABLE_OTP_PURPOSES.includes("database_reset_step2"));
    assert.ok(!REQUESTABLE_OTP_PURPOSES.includes("database_reset_authorization" as never));
    assert.ok(OTP_PURPOSE_LABELS.database_reset_step1.includes("step 1"));
    assert.ok(OTP_PURPOSE_LABELS.database_reset_step2.includes("step 2"));
  });

  it("preserves System Admin refresh tokens during reset wipe", () => {
    const source = readFileSync(
      path.join(__dirname, "settings.databaseReset.ts"),
      "utf8"
    );
    assert.match(source, /DELETE FROM refresh_tokens WHERE employee_id <> \$1/);
    assert.equal(
      /RESET_DELETE_TABLES[\s\S]*?\] as const/.exec(source)?.[0]?.includes('"refresh_tokens"'),
      false
    );
  });
});
