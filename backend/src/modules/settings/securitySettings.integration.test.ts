import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../../config/db";
import { initSettingsCache, updateCategory, refreshSettingsCache, getSettings } from "../settings/settings.cache";

describe("security settings persistence", { skip: process.env.SKIP_DB_TESTS === "1" }, () => {
  let adminId: string;
  let initialSecurity = getSettings().security;

  before(async () => {
    await initSettingsCache();
    initialSecurity = getSettings().security;
    const adminRow = await pool.query<{ id: string }>(
      `SELECT id FROM employees
        WHERE role = 'admin' AND is_active = true AND deleted_at IS NULL
        ORDER BY created_at ASC
        LIMIT 1`
    );
    if (!adminRow.rows[0]) throw new Error("Need an active admin for security settings tests");
    adminId = adminRow.rows[0].id;
  });

  after(async () => {
    await updateCategory("security", initialSecurity, adminId);
    await refreshSettingsCache();
  });

  it("persists extended security settings after update", async () => {
    const next = {
      ...initialSecurity,
      sessionTimeoutMinutes: 30,
      loginAttemptLimit: 7,
      passwordMinLength: 10,
      requireUppercase: false,
      requireNumbers: true,
      requireSpecialCharacters: true,
      passwordExpiryDays: 90,
      lockAccountAfterFailedAttempts: false,
      twoFactorEnabled: true,
    };

    await updateCategory("security", next, adminId);
    await refreshSettingsCache();

    const saved = getSettings().security;
    assert.equal(saved.sessionTimeoutMinutes, 30);
    assert.equal(saved.loginAttemptLimit, 7);
    assert.equal(saved.requireSpecialCharacters, true);
    assert.equal(saved.passwordExpiryDays, 90);
    assert.equal(saved.lockAccountAfterFailedAttempts, false);
    assert.equal(saved.twoFactorEnabled, false);
  });

  it("applies lockout setting through login attempt recording", async () => {
    await updateCategory(
      "security",
      {
        ...getSettings().security,
        loginAttemptLimit: 3,
        lockAccountAfterFailedAttempts: false,
      },
      adminId
    );
    await refreshSettingsCache();

    const { recordFailedLogin, isLoginLocked } = await import("../../utils/loginAttempts");
    const code = `LOCKTEST-${Date.now()}`;
    recordFailedLogin(code);
    recordFailedLogin(code);
    const result = recordFailedLogin(code);
    assert.equal(result.locked, false);
    assert.equal(isLoginLocked(code), false);
  });
});
