import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createJuniorAdminSchema,
  deleteJuniorAdminSchema,
} from "../juniorAdmins/juniorAdmins.validators";
import { otpFieldsSchema } from "./emailVerification.validators";
import { OTP_PURPOSES, OTP_PURPOSE_LABELS } from "./emailVerification.repository";

describe("OTP-protected junior admin and employee schemas", () => {
  const otp = {
    otpChallengeId: "11111111-1111-4111-8111-111111111111",
    otpCode: "123456",
  };

  it("requires OTP fields when creating a Junior Admin", () => {
    const parsed = createJuniorAdminSchema.parse({
      name: "Test Junior",
      ...otp,
    });
    assert.equal(parsed.name, "Test Junior");
    assert.equal(parsed.otpCode, "123456");

    assert.throws(() => createJuniorAdminSchema.parse({ name: "Missing OTP" }));
  });

  it("requires OTP fields when deleting a Junior Admin", () => {
    const parsed = deleteJuniorAdminSchema.parse(otp);
    assert.equal(parsed.otpChallengeId, otp.otpChallengeId);
    assert.throws(() => deleteJuniorAdminSchema.parse({}));
  });

  it("requires OTP fields when deleting an employee", () => {
    const parsed = otpFieldsSchema.parse(otp);
    assert.equal(parsed.otpCode, "123456");
    assert.throws(() => otpFieldsSchema.parse({ otpChallengeId: otp.otpChallengeId }));
  });

  it("includes the new sensitive-action OTP purposes", () => {
    for (const purpose of [
      "junior_admin_create",
      "junior_admin_delete",
      "employee_delete",
      "database_reset_step1",
      "database_reset_step2",
    ] as const) {
      assert.ok(OTP_PURPOSES.includes(purpose));
      assert.ok(OTP_PURPOSE_LABELS[purpose].length > 0);
    }
  });
});
