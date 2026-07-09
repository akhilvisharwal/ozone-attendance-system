import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isPasswordExpiredForSettings,
  normalizeSecuritySettings,
  validatePasswordPolicyForSettings,
} from "./settingsHelpers";
import type { SecuritySettings } from "../modules/settings/settings.types";

const strictPolicy: SecuritySettings = {
  sessionTimeoutMinutes: 15,
  loginAttemptLimit: 5,
  passwordMinLength: 8,
  requireUppercase: true,
  requireNumbers: true,
  requireSpecialCharacters: true,
  passwordExpiryDays: 30,
  lockAccountAfterFailedAttempts: true,
  twoFactorEnabled: false,
};

describe("security settings helpers", () => {
  it("normalizes security settings and disables two-factor until available", () => {
    const normalized = normalizeSecuritySettings({
      ...strictPolicy,
      sessionTimeoutMinutes: 15.8,
      passwordExpiryDays: 45.2,
      lockAccountAfterFailedAttempts: false,
      twoFactorEnabled: true,
    });
    assert.equal(normalized.sessionTimeoutMinutes, 16);
    assert.equal(normalized.passwordExpiryDays, 45);
    assert.equal(normalized.twoFactorEnabled, false);
    assert.equal(normalized.lockAccountAfterFailedAttempts, false);
  });

  it("validates password policy including special characters", () => {
    assert.match(validatePasswordPolicyForSettings("short1!", strictPolicy) ?? "", /at least 8/i);
    assert.match(validatePasswordPolicyForSettings("alllower1!", strictPolicy) ?? "", /uppercase/i);
    assert.match(validatePasswordPolicyForSettings("NoNumber!", strictPolicy) ?? "", /number/i);
    assert.match(
      validatePasswordPolicyForSettings("NoSpecial1", strictPolicy) ?? "",
      /special character/i
    );
    assert.equal(validatePasswordPolicyForSettings("Secure1!", strictPolicy), null);
  });

  it("detects expired passwords based on configured days", () => {
    const recent = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();

    assert.equal(isPasswordExpiredForSettings(recent, strictPolicy), false);
    assert.equal(isPasswordExpiredForSettings(old, strictPolicy), true);
    assert.equal(isPasswordExpiredForSettings(null, strictPolicy), true);
    assert.equal(
      isPasswordExpiredForSettings(old, { ...strictPolicy, passwordExpiryDays: 0 }),
      false
    );
  });
});
