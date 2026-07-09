import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../../config/db";
import { initSettingsCache, updateCategory, refreshSettingsCache, getSettings } from "../settings/settings.cache";

describe("notification settings persistence", { skip: process.env.SKIP_DB_TESTS === "1" }, () => {
  let adminId: string;
  let initialNotifications = getSettings().notifications;

  before(async () => {
    await initSettingsCache();
    initialNotifications = getSettings().notifications;
    const adminRow = await pool.query<{ id: string }>(
      `SELECT id FROM employees
        WHERE role = 'admin' AND is_active = true AND deleted_at IS NULL
        ORDER BY created_at ASC
        LIMIT 1`
    );
    if (!adminRow.rows[0]) throw new Error("Need an active admin for notification settings tests");
    adminId = adminRow.rows[0].id;
  });

  after(async () => {
    await updateCategory("notifications", initialNotifications, adminId);
    await refreshSettingsCache();
  });

  it("persists notification settings after update", async () => {
    const next = {
      emailEnabled: true,
      leaveApproval: false,
      attendanceReminder: true,
      holidayNotifications: false,
    };

    await updateCategory("notifications", next, adminId);
    await refreshSettingsCache();

    const saved = getSettings().notifications;
    assert.equal(saved.emailEnabled, true);
    assert.equal(saved.leaveApproval, false);
    assert.equal(saved.attendanceReminder, true);
    assert.equal(saved.holidayNotifications, false);
  });
});
