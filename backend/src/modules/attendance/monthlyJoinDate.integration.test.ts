import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../../config/db";
import { initSettingsCache } from "../settings/settings.cache";
import { buildMonthlyGrid } from "./attendance.monthly";

describe("monthly attendance join date", { skip: process.env.SKIP_DB_TESTS === "1" }, () => {
  let employeeId: string;
  const createdAttendanceIds: string[] = [];

  before(async () => {
    await initSettingsCache();
    const row = await pool.query<{ id: string }>(
      `SELECT id FROM employees
        WHERE role = 'employee' AND is_active = true AND deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1`
    );
    if (!row.rows[0]) throw new Error("Need an active employee for join-date tests");
    employeeId = row.rows[0].id;
  });

  after(async () => {
    if (createdAttendanceIds.length) {
      await pool.query(`DELETE FROM attendance WHERE id = ANY($1::uuid[])`, [createdAttendanceIds]);
    }
  });

  it("marks days before employee registration as not applicable in the monthly grid", async () => {
    const emp = await pool.query<{ created_at: Date }>(
      `SELECT created_at FROM employees WHERE id = $1`,
      [employeeId]
    );
    const joinDate = emp.rows[0].created_at;
    const joinYear = joinDate.getFullYear();
    const joinMonth = joinDate.getMonth() + 1;
    const joinDay = joinDate.getDate();

    const grid = await buildMonthlyGrid({
      year: joinYear,
      month: joinMonth,
      employeeId,
    });

    const row = grid.employees[0];
    assert.ok(row, "employee row must exist");

    for (const cell of row.days) {
      const dayNum = Number(cell.date.slice(-2));
      if (dayNum < joinDay) {
        assert.equal(
          cell.status,
          "not_applicable",
          `${cell.date} should be not_applicable before join day ${joinDay}`
        );
      }
    }

    const preJoinAbsent = row.days.filter(
      (d) => Number(d.date.slice(-2)) < joinDay && d.status === "absent"
    );
    assert.equal(preJoinAbsent.length, 0, "pre-join days must never be absent");

    const summary = row.summary;
    const preJoinCount = row.days.filter((d) => d.status === "not_applicable").length;
    if (preJoinCount > 0) {
      assert.ok(
        summary.absent < preJoinCount,
        "absent count must not include pre-join days"
      );
    }
  });

  it("does not count pre-join days toward working days or attendance percentage", async () => {
    const emp = await pool.query<{ created_at: Date }>(
      `SELECT created_at FROM employees WHERE id = $1`,
      [employeeId]
    );
    const joinDate = emp.rows[0].created_at;
    const joinYear = joinDate.getFullYear();
    const joinMonth = joinDate.getMonth() + 1;
    const joinDay = joinDate.getDate();
    const joinDateStr = `${joinYear}-${String(joinMonth).padStart(2, "0")}-${String(joinDay).padStart(2, "0")}`;

    const inserted = await pool.query<{ id: string }>(
      `INSERT INTO attendance (employee_id, attendance_date, status, check_in_time, total_minutes)
       VALUES ($1, $2, 'checked_out', now(), 480)
       ON CONFLICT (employee_id, attendance_date) DO UPDATE SET status = EXCLUDED.status
       RETURNING id`,
      [employeeId, joinDateStr]
    );
    createdAttendanceIds.push(inserted.rows[0].id);

    const grid = await buildMonthlyGrid({
      year: joinYear,
      month: joinMonth,
      employeeId,
    });
    const row = grid.employees[0];
    const naDays = row.days.filter((d) => d.status === "not_applicable").length;
    const daysInMonth = grid.daysInMonth;
    const maxPossibleWorking = daysInMonth - naDays;

    assert.ok(row.summary.workingDays <= maxPossibleWorking);
    assert.ok(naDays >= joinDay - 1);
  });
});
