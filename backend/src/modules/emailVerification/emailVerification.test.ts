import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  generateOtpCode,
  generateResetToken,
  hashSecret,
  OTP_PURPOSE_LABELS,
  OTP_PURPOSES,
} from "./emailVerification.repository";
import { maskEmail } from "./emailVerification.service";

describe("email verification helpers", () => {
  it("generates 6-digit OTP codes", () => {
    for (let i = 0; i < 20; i++) {
      const code = generateOtpCode();
      assert.match(code, /^\d{6}$/);
    }
  });

  it("hashes secrets deterministically and differently for different inputs", () => {
    const a = hashSecret("123456");
    const b = hashSecret("123456");
    const c = hashSecret("654321");
    assert.equal(a, b);
    assert.notEqual(a, c);
    assert.equal(a.length, 64);
  });

  it("generates high-entropy reset tokens", () => {
    const token = generateResetToken();
    assert.equal(token.length, 64);
    assert.match(token, /^[a-f0-9]+$/);
    assert.notEqual(generateResetToken(), token);
  });

  it("masks emails for UI/audit display", () => {
    assert.equal(maskEmail("info@ozoneairconhvac.com"), "in***@ozoneairconhvac.com");
    assert.equal(maskEmail("a@b.com"), "a***@b.com");
  });

  it("covers all OTP purposes with labels", () => {
    for (const purpose of OTP_PURPOSES) {
      assert.ok(OTP_PURPOSE_LABELS[purpose].length > 0);
    }
  });
});
