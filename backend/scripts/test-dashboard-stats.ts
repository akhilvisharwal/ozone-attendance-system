import { pool } from "../src/config/db";
import bcrypt from "bcryptjs";
import {
  classifyEmployeeDayBucket,
  getDashboardSummary,
  isLateArrival,
} from "../src/modules/dashboard/dashboard.stats";
import * as employeesRepo from "../src/modules/employees/employees.repository";
import * as attendanceRepo from "../src/modules/attendance/attendance.repository";
import { todayDateString } from "../src/utils/date";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

function testClassifiers() {
  assert(classifyEmployeeDayBucket(null) === "absent", "no record = absent");

  assert(
    classifyEmployeeDayBucket({
      status: "checked_in",
      day_status: null,
      check_in_status: "on_time",
      is_half_day: false,
    }) === "present",
    "pending on-time check-in = present"
  );

  assert(
    classifyEmployeeDayBucket({
      status: "checked_in",
      day_status: null,
      check_in_status: "late",
      is_half_day: false,
    }) === "present",
    "pending late check-in still counts as present bucket"
  );

  assert(
    classifyEmployeeDayBucket({
      status: "checked_in",
      day_status: null,
      check_in_status: "half_day",
      is_half_day: true,
    }) === "half_day",
    "pending half-day check-in = half_day"
  );

  assert(
    classifyEmployeeDayBucket({
      status: "checked_out",
      day_status: "present",
      check_in_status: "on_time",
      is_half_day: false,
    }) === "present",
    "checked out present = present"
  );

  assert(
    classifyEmployeeDayBucket({
      status: "checked_out",
      day_status: "absent",
      check_in_status: "on_time",
      is_half_day: false,
    }) === "absent",
    "insufficient hours absent = absent"
  );

  assert(
    classifyEmployeeDayBucket({
      status: "absent",
      day_status: "absent",
      check_in_status: null,
      is_half_day: false,
    }) === "absent",
    "admin absent = absent"
  );

  assert(
    isLateArrival({
      status: "checked_in",
      check_in_status: "late",
      is_admin_marked: false,
      check_in_time: new Date(),
    }),
    "late natural check-in detected"
  );

  assert(
    !isLateArrival({
      status: "checked_out",
      check_in_status: "late",
      is_admin_marked: true,
      check_in_time: new Date(),
    }),
    "admin-marked records are not late arrivals"
  );

  console.log("Classifier unit tests: OK");
}

async function countActiveEmployees(): Promise<number> {
  const res = await pool.query<{ count: string }>(
    "SELECT COUNT(*) FROM employees WHERE role = 'employee' AND is_active = true AND deleted_at IS NULL"
  );
  return parseInt(res.rows[0].count, 10);
}

async function manualExpected(today: string) {
  const employees = await pool.query<{ id: string }>(
    "SELECT id FROM employees WHERE role = 'employee' AND is_active = true AND deleted_at IS NULL"
  );
  const records = await pool.query(
    `SELECT * FROM attendance WHERE attendance_date = $1`,
    [today]
  );
  const byEmployee = new Map(records.rows.map((r) => [r.employee_id, r]));

  let present = 0;
  let half = 0;
  let absent = 0;
  let late = 0;
  let checkedIn = 0;
  let checkedOut = 0;

  for (const emp of employees.rows) {
    const record = byEmployee.get(emp.id) ?? null;
    const bucket = classifyEmployeeDayBucket(
      record
        ? {
            status: record.status,
            day_status: record.day_status,
            check_in_status: record.check_in_status,
            is_half_day: record.is_half_day,
          }
        : null
    );
    if (bucket === "present") present += 1;
    if (bucket === "half_day") half += 1;
    if (bucket === "absent") absent += 1;
    if (record?.status === "checked_in") checkedIn += 1;
    if (record?.status === "checked_out") checkedOut += 1;
    if (isLateArrival(record)) late += 1;
  }

  return {
    totalEmployees: employees.rows.length,
    presentToday: present,
    halfDayToday: half,
    absentToday: absent,
    lateArrivals: late,
    currentlyCheckedIn: checkedIn,
    checkedOutToday: checkedOut,
  };
}

async function main() {
  testClassifiers();

  const today = todayDateString();
  const beforeActive = await countActiveEmployees();
  const summary = await getDashboardSummary(today);
  const expected = await manualExpected(today);

  console.log("\nLive DB comparison for", today);
  console.log("API summary:", summary);
  console.log("Manual expected:", expected);

  for (const key of Object.keys(expected) as (keyof typeof expected)[]) {
    assert(summary[key] === expected[key], `${key}: got ${summary[key]}, expected ${expected[key]}`);
  }
  assert(
    summary.presentToday + summary.halfDayToday + summary.absentToday === summary.totalEmployees,
    "present + half + absent must equal total employees"
  );
  console.log("Live DB totals match manual calculation: OK");

  // Lifecycle scenario with a temporary employee
  console.log("\nLifecycle scenario...");
  const code = `DASH${Date.now().toString().slice(-6)}`;
  const hash = await bcrypt.hash("TempPass@123", 12);
  const admin = await pool.query<{ id: string }>(
    "SELECT id FROM employees WHERE employee_code = 'OZNADMIN' LIMIT 1"
  );
  const adminRow = admin.rows[0];
  if (!adminRow) throw new Error("OZNADMIN not found");
  const created = await employeesRepo.createEmployee({
    employeeCode: code,
    name: "Dashboard Test",
    email: null,
    phone: null,
    passwordHash: hash,
    role: "employee",
    createdBy: adminRow.id,
  });

  let s = await getDashboardSummary(today);
  assert(s.totalEmployees === beforeActive + 1, "new employee increases total");
  assert(s.absentToday >= 1, "new employee without attendance is absent");

  await attendanceRepo.adminMarkPresent({
    employeeId: created.id,
    date: today,
    adminId: adminRow.id,
    reason: "test",
    totalMinutes: 480,
  });
  s = await getDashboardSummary(today);
  assert(s.presentToday >= 1, "admin present increases present count");
  assert(s.checkedOutToday >= 1, "admin present counts as checked out");

  await attendanceRepo.adminMarkAbsent({
    employeeId: created.id,
    date: today,
    adminId: adminRow.id,
    reason: "test",
  });
  s = await getDashboardSummary(today);
  const exp2 = await manualExpected(today);
  for (const key of Object.keys(exp2) as (keyof typeof exp2)[]) {
    assert(s[key] === exp2[key], `after absent ${key}: got ${s[key]}, expected ${exp2[key]}`);
  }

  await employeesRepo.softDeleteEmployee(created.id);
  s = await getDashboardSummary(today);
  assert(s.totalEmployees === beforeActive, "deleted employee removed from total");

  console.log("\nAll dashboard stat tests passed.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
