import { Pool, types } from "pg";
import { env } from "./env";

// By default node-postgres parses DATE columns into a JS Date object at UTC
// midnight, which can shift to the wrong calendar day once rendered in a
// non-UTC timezone. We store/compare attendance dates as plain YYYY-MM-DD
// strings throughout the app, so keep them as raw text from the driver.
const PG_TYPE_DATE_OID = 1082;
types.setTypeParser(PG_TYPE_DATE_OID, (value: string) => value);

export const pool = new Pool({
  connectionString: env.databaseUrl,
  ssl: env.databaseSsl ? { rejectUnauthorized: false } : undefined,
});

pool.on("error", (err) => {
  console.error("Unexpected error on idle Postgres client", err);
  if (!env.isProduction) {
    process.exit(1);
  }
});

// Ensure every connection's session timezone matches the app's TZ so that
// "today" boundaries and time-of-day comparisons (e.g. late-arrival checks)
// line up between Node and Postgres.
pool.on("connect", (client) => {
  client.query(`SET TIME ZONE '${env.timezone.replace(/'/g, "")}'`).catch((err) => {
    console.error("Failed to set session timezone:", err);
  });
});

export async function query<T = any>(text: string, params?: any[]) {
  const start = Date.now();
  const result = await pool.query(text, params);
  if (!env.isProduction) {
    const duration = Date.now() - start;
    console.log("executed query", { text, duration, rows: result.rowCount });
  }
  return result as { rows: T[]; rowCount: number };
}

export async function withTransaction<T>(
  fn: (client: import("pg").PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
