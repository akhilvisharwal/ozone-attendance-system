import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../../config/db";
import { initSettingsCache } from "../settings/settings.cache";
import { runDailyAttendanceProcessing } from "../../services/dailyAttendance.service";
import { buildMonthlyGrid } from "./attendance.monthly";
import { employeeJoinDate } from "../../utils/date";

describe("daily attendance processing", { skip: process.env.SKIP_DB_TESTS === "1" }, () => {
  let employeeId: string;
  let joinDate: string;
  const createdAttendanceIds: string[] = [];

  before(async () => {
    await initSettingsCache();
    const row = await pool.query<{ id: string; created_at: Date }>(
      `SELECT id, created_at FROM employees
        WHERE role = 'employee' AND is_active = true AND deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1`
    );
    if (!row.rows[0]) throw new Error("Need an active employee");
    employeeId = row.rows[0].id;
    joinDate = employeeJoinDate(row.rows[0].created_at);
  });

  after(async () => {
    if (createdAttendanceIds.length) {
      await pool.query(`DELETE FROM attendance WHERE id = ANY($1::uuid[])`, [createdAttendanceIds]);
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
});
