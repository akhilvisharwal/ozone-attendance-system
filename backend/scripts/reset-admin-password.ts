/**
 * Sync the local/system administrator password hash to ADMIN_PASSWORD from .env.
 * Usage (from backend/): npm run reset-admin-password
 */
import bcrypt from "bcryptjs";
import { pool } from "../src/config/db";
import { env } from "../src/config/env";

async function main() {
  const employeeCode = env.adminEmployeeId.trim().toUpperCase();
  const password = env.adminPassword.trim();
  if (!password) {
    throw new Error("ADMIN_PASSWORD is empty. Set it in backend/.env");
  }

  const hash = await bcrypt.hash(password, 12);
  const result = await pool.query(
    `UPDATE employees
        SET password_hash = $1,
            is_active = true,
            must_change_password = false,
            first_login_completed = true,
            password_changed_at = now(),
            updated_at = now()
      WHERE UPPER(employee_code) = $2
        AND role = 'admin'
        AND deleted_at IS NULL`,
    [hash, employeeCode]
  );

  if ((result.rowCount ?? 0) === 0) {
    throw new Error(
      `${employeeCode} account not found — run npm run seed first`
    );
  }

  console.log("Admin password synced to ADMIN_PASSWORD.");
  console.log(`  Employee ID: ${employeeCode}`);
  if (env.isProduction) {
    console.log("  Password:    (from ADMIN_PASSWORD — not printed in production logs)");
  } else {
    console.log(`  Password:    ${password}`);
  }
}

main()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(err instanceof Error ? err.message : err);
    await pool.end().catch(() => undefined);
    process.exit(1);
  });
