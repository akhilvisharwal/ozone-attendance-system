import { pool } from "../src/config/db";
import { getDashboardSummary } from "../src/modules/dashboard/dashboard.stats";
import { todayDateString } from "../src/utils/date";

async function main() {
  const today = todayDateString();
  const summary = await getDashboardSummary(today);
  console.log("Today:", today);
  console.log("Summary:", JSON.stringify(summary, null, 2));

  const emp = await pool.query(
    "SELECT COUNT(*)::int AS count FROM employees WHERE role = 'employee' AND is_active = true AND deleted_at IS NULL"
  );
  const att = await pool.query(
    `SELECT a.status, a.day_status, a.check_in_status, a.is_admin_marked, a.is_half_day,
            e.name, e.employee_code
       FROM attendance a
       JOIN employees e ON e.id = a.employee_id
      WHERE a.attendance_date = $1
        AND e.role = 'employee'
        AND e.is_active = true
        AND e.deleted_at IS NULL
      ORDER BY e.name`,
    [today]
  );
  console.log("\nActive employees:", emp.rows[0].count);
  console.log("Today attendance rows (active only):", att.rows.length);
  for (const r of att.rows) {
    console.log(
      ` - ${r.name} (${r.employee_code}) | status=${r.status} day=${r.day_status} check_in=${r.check_in_status} half=${r.is_half_day} admin=${r.is_admin_marked}`
    );
  }
}

main()
  .catch(console.error)
  .finally(() => pool.end());
