/**
 * Apply pending migrations from ./drizzle and PROVE it from information_schema.
 *
 * drizzle-kit migrate exits 1 silently on a connection error, and a journal entry
 * whose `when` is not past the last applied one is skipped while "migrations
 * applied successfully!" still prints. So this script runs the programmatic
 * migrator, then lists every public table and the migration ledger, and fails
 * loudly if either is empty — or if the ledger is SHORTER than the journal,
 * which is what a skipped migration looks like from here and is the only shape
 * of this failure a person can see without knowing to go looking (§5 #162).
 */
import { readFileSync } from "node:fs";
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

const journal = JSON.parse(readFileSync("./drizzle/meta/_journal.json", "utf-8")) as {
  entries: { idx: number; when: number; tag: string }[];
};

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
  // The migrator applies an entry only when its `when` is past the newest one
  // already applied, and says nothing about the ones it therefore skipped. A
  // clock that ran ahead once puts every later migration behind that mark for
  // as long as it takes real time to catch up, and the file, the journal and
  // the console all agree that everything is fine.
  const applied = ledger.rowCount ?? 0;
  if (applied < journal.entries.length) {
    const skipped = journal.entries.slice(applied).map((e) => e.tag);
    console.error(
      `Migration reported success and applied ${applied} of ${journal.entries.length}. ` +
        `Never applied: ${skipped.join(", ")}.`,
    );
    console.error(
      "A journal entry is applied only if its `when` is past the newest one in the ledger; " +
        "raise it in drizzle/meta/_journal.json and run this again.",
    );
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
