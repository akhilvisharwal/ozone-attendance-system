import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { pool } from "../../config/db";
import { initSettingsCache } from "../settings/settings.cache";
import { buildMonthlyGrid } from "./attendance.monthly";
import { upsertManualAttendance, deleteManualAttendance } from "./attendance.repository";

describe("monthly attendance join date", { skip: process.env.SKIP_DB_TESTS === "1" }, () => {
  let employeeId: string;
  let adminId: string;
  const stamp = Date.now();
  // Mid-month join so pre-join days exist in the same month.
  const joinYear = 2026;
  const joinMonth = 3;
  const joinDay = 15;
  const joinDateStr = `${joinYear}-03-${String(joinDay).padStart(2, "0")}`;
  const preJoinDate = `${joinYear}-03-05`;

  before(async () => {
    await initSettingsCache();
    const admin = await pool.query<{ id: string }>(
      `SELECT id FROM employees
        WHERE role = 'admin' AND is_active = true AND deleted_at IS NULL
        ORDER BY created_at ASC
        LIMIT 1`
    );
    if (!admin.rows[0]) throw new Error("Need an active admin for join-date tests");
    adminId = admin.rows[0].id;

    const created = await pool.query<{ id: string }>(
      `INSERT INTO employees (
         employee_code, name, email, password_hash, role, is_active,
         must_change_password, first_login_completed, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, 'employee', true, false, true, $5::timestamptz, now()
       )
       RETURNING id`,
      [
        `JD${String(stamp).slice(-6)}`,
        `Join Date Test ${stamp}`,
        `join-date-${stamp}@example.com`,
        await bcrypt.hash("TempPass1!", 10),
        `${joinDateStr}T10:00:00+05:30`,
      ]
    );
    employeeId = created.rows[0].id;
  });

  after(async () => {
    if (employeeId) {
      await pool.query(`DELETE FROM attendance WHERE employee_id = $1`, [employeeId]);
      await pool.query(`DELETE FROM employees WHERE id = $1`, [employeeId]);
    }
  });

  it("marks days before employee registration as not applicable in the monthly grid", async () => {
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
  });

  it("does not count pre-join days toward working days or attendance percentage", async () => {
    const grid = await buildMonthlyGrid({
      year: joinYear,
      month: joinMonth,
      employeeId,
    });
    const row = grid.employees[0];
    assert.ok(row);
    const naDays = row.days.filter((d) => d.status === "not_applicable").length;
    assert.equal(naDays, joinDay - 1);
    assert.ok(row.summary.workingDays <= grid.daysInMonth - naDays);
  });

  it("shows manual attendance edits on pre-join dates in the monthly grid", async () => {
    const record = await upsertManualAttendance({
      employeeId,
      date: preJoinDate,
      status: "present",
      adminId,
      approvedById: adminId,
      reason: "Backdated pre-join correction",
      checkInTime: "09:00",
      checkOutTime: "18:00",
      totalMinutes: 540,
    });
    assert.ok(record.id);

    const grid = await buildMonthlyGrid({
      year: joinYear,
      month: joinMonth,
      employeeId,
    });
    const row = grid.employees[0];
    assert.ok(row);
    const cell = row.days.find((d) => d.date === preJoinDate);
    assert.ok(cell);
    assert.equal(cell.status, "present");
    assert.ok((cell.totalMinutes ?? 0) > 0);
    assert.ok(row.summary.present >= 1);

    await deleteManualAttendance(employeeId, preJoinDate);
  });
});
