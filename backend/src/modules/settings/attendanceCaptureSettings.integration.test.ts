import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../../config/db";
import { initSettingsCache, updateCategory, refreshSettingsCache, getSettings } from "../settings/settings.cache";

describe("attendance capture settings persistence", { skip: process.env.SKIP_DB_TESTS === "1" }, () => {
  let adminId: string;
  let initialMobile = getSettings().mobile;

  before(async () => {
    await initSettingsCache();
    initialMobile = getSettings().mobile;
    const adminRow = await pool.query<{ id: string }>(
      `SELECT id FROM employees
        WHERE role = 'admin' AND is_active = true AND deleted_at IS NULL
        ORDER BY created_at ASC
        LIMIT 1`
    );
    if (!adminRow.rows[0]) throw new Error("Need an active admin for attendance capture settings tests");
    adminId = adminRow.rows[0].id;
  });

  after(async () => {
    await updateCategory("mobile", initialMobile, adminId);
    await refreshSettingsCache();
  });

  it("persists attendance capture settings after update", async () => {
    const next = {
      ...initialMobile,
      gpsRequiredCheckIn: false,
      gpsRequiredCheckOut: false,
      selfieRequiredCheckIn: false,
      selfieRequiredCheckOut: true,
      allowCameraSwitch: false,
      gpsAccuracyThresholdMeters: 75,
      allowOfflineMode: true,
      allowDesktopCheckIn: false,
    };

    await updateCategory("mobile", next, adminId);
    await refreshSettingsCache();

    const saved = getSettings().mobile;
    assert.equal(saved.gpsRequiredCheckIn, false);
    assert.equal(saved.selfieRequiredCheckOut, true);
    assert.equal(saved.allowOfflineMode, true);
    assert.equal(saved.allowDesktopCheckIn, false);
    assert.equal(saved.gpsAccuracyThresholdMeters, 75);
  });
});
