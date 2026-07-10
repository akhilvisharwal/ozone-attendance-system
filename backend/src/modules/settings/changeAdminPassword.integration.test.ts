import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { pool } from "../../config/db";
import { initSettingsCache, getSettings } from "./settings.cache";

describe("change admin password API data", { skip: process.env.SKIP_DB_TESTS === "1" }, () => {
  let adminId: string;
  const originalHashById = new Map<string, string>();

  before(async () => {
    await initSettingsCache();
    const admin = await pool.query<{ id: string; password_hash: string }>(
      `SELECT id, password_hash FROM employees
        WHERE role = 'admin' AND is_active = true AND deleted_at IS NULL
        ORDER BY created_at ASC
        LIMIT 1`
    );
    if (!admin.rows[0]) throw new Error("Need an active admin for password change tests");
    adminId = admin.rows[0].id;
    originalHashById.set(adminId, admin.rows[0].password_hash);
  });

  after(async () => {
    const original = originalHashById.get(adminId);
    if (original) {
      await pool.query(`UPDATE employees SET password_hash = $1 WHERE id = $2`, [original, adminId]);
    }
  });

  it("does not expose any password fields in security settings", () => {
    const security = getSettings().security as Record<string, unknown>;
    assert.equal("currentPassword" in security, false);
    assert.equal("password" in security, false);
    assert.equal("passwordHash" in security, false);
  });

  it("stores only bcrypt hashes and never returns plaintext passwords", async () => {
    const knownPassword = `KnownAdmin${String(Date.now()).slice(-4)}!9`;
    const knownHash = await bcrypt.hash(knownPassword, 12);

    await pool.query(`UPDATE employees SET password_hash = $1 WHERE id = $2`, [knownHash, adminId]);

    const row = await pool.query<{ password_hash: string }>(
      `SELECT password_hash FROM employees WHERE id = $1`,
      [adminId]
    );
    assert.ok(row.rows[0]);
    assert.equal(await bcrypt.compare(knownPassword, row.rows[0].password_hash), true);

    const newPassword = `NewAdmin${String(Date.now()).slice(-4)}!9`;
    const hash = await bcrypt.hash(newPassword, 12);
    await pool.query(
      `UPDATE employees
          SET password_hash = $1,
              must_change_password = false,
              first_login_completed = true,
              password_changed_at = now(),
              updated_at = now()
        WHERE id = $2`,
      [hash, adminId]
    );

    const updated = await pool.query<{ password_hash: string }>(
      `SELECT password_hash FROM employees WHERE id = $1`,
      [adminId]
    );
    assert.ok(updated.rows[0]);
    assert.equal(updated.rows[0].password_hash.startsWith("$2"), true);
    assert.equal(await bcrypt.compare(newPassword, updated.rows[0].password_hash), true);
    assert.notEqual(updated.rows[0].password_hash, newPassword);
  });
});
