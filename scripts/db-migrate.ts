/**
 * Apply pending migrations from ./drizzle and PROVE it from information_schema.
 *
 * drizzle-kit migrate exits 1 silently on a connection error, and a journal entry
 * with a stale `when` is skipped while "migrations applied successfully!" still
 * prints. So this script runs the programmatic migrator, then lists every public
 * table and the migration ledger, and fails loudly if either is empty.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { loadEnv } from "../src/lib/env";

loadEnv();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (copy .env.example to .env).");
  process.exit(1);
}

const pool = new Pool({ connectionString: url.trim() });
const db = drizzle(pool);

try {
  await migrate(db, { migrationsFolder: "./drizzle" });
  const tables = await pool.query<{ table_name: string }>(
    `select table_name from information_schema.tables
     where table_schema = 'public' order by table_name`,
  );
  const ledger = await pool.query<{ hash: string; created_at: string }>(
    `select hash, created_at from drizzle.__drizzle_migrations order by created_at`,
  );
  if (tables.rowCount === 0 || ledger.rowCount === 0) {
    console.error("Migration reported success but the database is empty. Not applied.");
    process.exit(1);
  }
  console.log(`db:migrate — ${ledger.rowCount} migration(s) in the ledger`);
  console.log(`db:migrate — ${tables.rowCount} table(s):`);
  for (const t of tables.rows) console.log("  " + t.table_name);
} catch (err) {
  console.error("db:migrate failed:", err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await pool.end();
}
