import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { pool } from "../../config/db";
import { initSettingsCache, updateCategory, refreshSettingsCache, getSettings } from "../settings/settings.cache";
import { runDailyAttendanceProcessing } from "../../services/dailyAttendance.service";
import { buildMonthlyGrid } from "./attendance.monthly";
import { employeeJoinDate } from "../../utils/date";

describe("daily attendance processing", { skip: process.env.SKIP_DB_TESTS === "1" }, () => {
  let employeeId: string;
  let joinDate: string;
  let adminId: string;
  const createdAttendanceIds: string[] = [];
  const stamp = Date.now();

  before(async () => {
    await initSettingsCache();
    const adminRow = await pool.query<{ id: string }>(
      `SELECT id FROM employees WHERE role = 'admin' AND is_active = true AND deleted_at IS NULL LIMIT 1`
    );
    if (!adminRow.rows[0]) throw new Error("Need an active admin for this suite");
    adminId = adminRow.rows[0].id;

    // A dedicated employee, not "the most recently created active employee"
    // — under full-suite concurrency, another test file's cleanup can hard-
    // delete whichever employee happened to be "most recent" out from under
    // this suite's own inserts, throwing an attendance_employee_id_fkey
    // violation. Same class of isolation bug fixed earlier this engagement
    // for advancePlans.integration.test.ts.
    const created = await pool.query<{ id: string; created_at: Date }>(
      `INSERT INTO employees (
         employee_code, name, email, password_hash, role, is_active,
         must_change_password, first_login_completed
       ) VALUES ($1, $2, $3, $4, 'employee', true, false, true)
       RETURNING id, created_at`,
      [
        `DA${String(stamp).slice(-6)}`,
        `Daily Attendance Test ${stamp}`,
        `daily-attendance-${stamp}@example.com`,
        await bcrypt.hash("TempPass1!", 10),
      ]
    );
    employeeId = created.rows[0].id;
    joinDate = employeeJoinDate(created.rows[0].created_at);
  });

  after(async () => {
    if (createdAttendanceIds.length) {
      await pool.query(`DELETE FROM attendance WHERE id = ANY($1::uuid[])`, [createdAttendanceIds]);
    }
    if (employeeId) {
      await pool.query(`DELETE FROM attendance WHERE employee_id = $1`, [employeeId]);
      await pool.query(`DELETE FROM employees WHERE id = $1`, [employeeId]);
    }
  });

  it("marks absent only for post-join working days with no check-in", async () => {
    const testDate = "2099-03-10";
    assert.ok(testDate >= joinDate, "test date must be after employee join date");

    const result = await runDailyAttendanceProcessing({
      date: testDate,
      force: true,
      now: new Date(2099, 2, 10, 20, 0, 0),
    });
    assert.ok(result.markedAbsent >= 1);

    const grid = await buildMonthlyGrid({
      year: 2099,
      month: 3,
      employeeId,
    });
    const row = grid.employees[0];
    const testCell = row.days.find((d) => d.date === testDate);
    assert.equal(testCell?.status, "absent");

    const preJoinCell = row.days.find((d) => d.date < joinDate);
    if (preJoinCell) {
      assert.equal(preJoinCell.status, "not_applicable");
    }

    const inserted = await pool.query<{ id: string }>(
      `SELECT id FROM attendance WHERE employee_id = $1 AND attendance_date = $2`,
      [employeeId, testDate]
    );
    if (inserted.rows[0]) createdAttendanceIds.push(inserted.rows[0].id);
  });

  it("finalizes open check-in sessions with automatic day_status", async () => {
    const testDate = "2099-03-12";
    assert.ok(testDate >= joinDate);

    const inserted = await pool.query<{ id: string }>(
      `INSERT INTO attendance (
         employee_id, attendance_date, status, check_in_time,
         check_in_status, is_half_day, site_id
       )
       SELECT $1, $2, 'checked_in', $3::timestamptz, 'half_day', true, s.id
         FROM sites s
        WHERE s.deleted_at IS NULL
        LIMIT 1
       RETURNING id`,
      [employeeId, testDate, `${testDate}T12:30:00`]
    );
    createdAttendanceIds.push(inserted.rows[0].id);

    const result = await runDailyAttendanceProcessing({
      date: testDate,
      force: true,
      now: new Date(2099, 2, 12, 20, 0, 0),
    });
    assert.ok(result.finalizedSessions >= 1);

    const record = await pool.query<{
      status: string;
      day_status: string | null;
      total_minutes: number | null;
    }>(`SELECT status, day_status, total_minutes FROM attendance WHERE id = $1`, [
      inserted.rows[0].id,
    ]);
    assert.equal(record.rows[0]?.status, "checked_out");
    assert.ok(record.rows[0]?.day_status);
    assert.ok((record.rows[0]?.total_minutes ?? 0) > 0);
  });

  describe("Settings → Attendance → Mark Absent If Not Checked Out", () => {
    const initialAttendance = getSettings().attendance;

    after(async () => {
      // Restore whatever the suite found on disk, regardless of which `it`
      // ran last — this setting must never leak into other test files.
      await updateCategory("attendance", initialAttendance, adminId);
      await refreshSettingsCache();
    });

    it("forces day_status to absent but still records check-out time and worked minutes, when enabled", async () => {
      const testDate = "2099-03-14";
      assert.ok(testDate >= joinDate);

      // A full 9-hour session — well above the present threshold — so a
      // forced "absent" here can only be explained by the setting, not by
      // the hours genuinely falling short.
      const inserted = await pool.query<{ id: string }>(
        `INSERT INTO attendance (
           employee_id, attendance_date, status, check_in_time, site_id
         )
         SELECT $1, $2, 'checked_in', $3::timestamptz, s.id
           FROM sites s
          WHERE s.deleted_at IS NULL
          LIMIT 1
         RETURNING id`,
        [employeeId, testDate, `${testDate}T09:00:00`]
      );
      createdAttendanceIds.push(inserted.rows[0].id);

      await updateCategory("attendance", { ...initialAttendance, markAbsentIfNoCheckout: true }, adminId);
      await refreshSettingsCache();

      const result = await runDailyAttendanceProcessing({
        date: testDate,
        force: true,
        now: new Date(2099, 2, 14, 20, 0, 0),
      });
      assert.ok(result.finalizedSessions >= 1);

      const record = await pool.query<{
        status: string;
        day_status: string | null;
        check_out_time: Date | null;
        total_minutes: number | null;
        admin_mark_reason: string | null;
      }>(
        `SELECT status, day_status, check_out_time, total_minutes, admin_mark_reason
           FROM attendance WHERE id = $1`,
        [inserted.rows[0].id]
      );
      const row = record.rows[0];
      assert.equal(row?.status, "checked_out");
      assert.equal(row?.day_status, "absent", "forced absent despite a full day's worked minutes");
      assert.ok(row?.check_out_time, "check-out time must still be recorded");
      assert.ok((row?.total_minutes ?? 0) > 400, "worked minutes must still be recorded, not discarded");
      assert.match(row?.admin_mark_reason ?? "", /never checked out/i);
    });

    it("falls back to today's calculated status when disabled (default, regression check)", async () => {
      const testDate = "2099-03-15";
      assert.ok(testDate >= joinDate);

      const inserted = await pool.query<{ id: string }>(
        `INSERT INTO attendance (
           employee_id, attendance_date, status, check_in_time, site_id
         )
         SELECT $1, $2, 'checked_in', $3::timestamptz, s.id
           FROM sites s
          WHERE s.deleted_at IS NULL
          LIMIT 1
         RETURNING id`,
        [employeeId, testDate, `${testDate}T09:00:00`]
      );
      createdAttendanceIds.push(inserted.rows[0].id);

      await updateCategory("attendance", { ...initialAttendance, markAbsentIfNoCheckout: false }, adminId);
      await refreshSettingsCache();

      await runDailyAttendanceProcessing({
        date: testDate,
        force: true,
        now: new Date(2099, 2, 15, 20, 0, 0),
      });

      const record = await pool.query<{ day_status: string | null; admin_mark_reason: string | null }>(
        `SELECT day_status, admin_mark_reason FROM attendance WHERE id = $1`,
        [inserted.rows[0].id]
      );
      // Same 9-hour session as the previous test, opposite setting: must
      // land back on the calculated status, not absent.
      assert.equal(record.rows[0]?.day_status, "present");
      assert.equal(record.rows[0]?.admin_mark_reason, "Auto-finalized at end of day");
    });
  });
});
