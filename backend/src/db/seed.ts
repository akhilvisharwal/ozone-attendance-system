import bcrypt from "bcryptjs";
import { pool } from "../config/db";
import { env } from "../config/env";

async function seed() {
  const existing = await pool.query("SELECT id FROM employees WHERE employee_code = $1", [
    env.adminEmployeeId,
  ]);

  const password = env.adminPassword.trim();
  const passwordHash = await bcrypt.hash(password, 12);

  if ((existing.rowCount ?? 0) > 0) {
    await pool.query(
      `UPDATE employees
          SET password_hash = $1,
              password_changed_at = now()
        WHERE employee_code = $2`,
      [passwordHash, env.adminEmployeeId]
    );
    console.log(`Updated administrator password for '${env.adminEmployeeId}'.`);
  } else {
    await pool.query(
      `INSERT INTO employees (employee_code, name, email, password_hash, role, is_active, must_change_password)
       VALUES ($1, $2, $3, $4, 'admin', true, false)`,
      [env.adminEmployeeId, env.adminName, env.adminEmail, passwordHash]
    );
    console.log("Seeded administrator account:");
  }

  console.log(`  Employee ID: ${env.adminEmployeeId}`);
  if (env.isProduction) {
    console.log("  Password:    (from ADMIN_PASSWORD — not printed in production logs)");
  } else {
    console.log(`  Password:    ${password}`);
  }
  console.log("Please log in and change this password / rotate credentials for production use.");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
