import bcrypt from "bcryptjs";
import { pool } from "../config/db";
import { env } from "../config/env";

async function seed() {
  const existing = await pool.query("SELECT id FROM employees WHERE employee_code = $1", [
    env.adminEmployeeId,
  ]);

  if ((existing.rowCount ?? 0) > 0) {
    console.log(`Admin account '${env.adminEmployeeId}' already exists. Skipping seed.`);
    process.exit(0);
  }

  const passwordHash = await bcrypt.hash(env.adminPassword, 12);

  await pool.query(
    `INSERT INTO employees (employee_code, name, email, password_hash, role, is_active, must_change_password)
     VALUES ($1, $2, $3, $4, 'admin', true, false)`,
    [env.adminEmployeeId, env.adminName, env.adminEmail, passwordHash]
  );

  console.log("Seeded administrator account:");
  console.log(`  Employee ID: ${env.adminEmployeeId}`);
  console.log(`  Password:    ${env.adminPassword}`);
  console.log("Please log in and change this password / rotate credentials for production use.");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
