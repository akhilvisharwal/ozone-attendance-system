/**
 * Sync OZNADMIN password hash to ADMIN_PASSWORD env var (production shell use).
 * Usage: node scripts/reset-admin-password.js
 */
const bcrypt = require("bcryptjs");
const { pool } = require("../dist/config/db");

async function main() {
  const pwd = process.env.ADMIN_PASSWORD;
  if (!pwd) {
    throw new Error("ADMIN_PASSWORD environment variable is not set");
  }

  const hash = await bcrypt.hash(pwd, 12);
  const result = await pool.query(
    "UPDATE employees SET password_hash = $1 WHERE employee_code = 'OZNADMIN'",
    [hash]
  );

  if ((result.rowCount ?? 0) === 0) {
    throw new Error("OZNADMIN account not found — run npm run seed first");
  }

  console.log("Admin password synced to ADMIN_PASSWORD env var.");
  console.log(`  Employee ID: ${process.env.ADMIN_EMPLOYEE_ID ?? "OZNADMIN"}`);
  console.log(`  Password:    ${pwd}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err.message ?? err);
    process.exit(1);
  });
