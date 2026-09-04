/**
 * Empty every record table. Development only — there is no production data.
 * Keeps the schema and the migration ledger; removes every row, lookups
 * included, so `npm run seed:demo` starts from nothing.
 *
 * `restart identity` restarts only the sequences OWNED by identity columns.
 * `quotation_numbers` and `dispatch_numbers` are free-standing sequences — Q-1
 * and D-1 come off them — so an emptied database would still hand out Q-42 next.
 * Every public sequence is restarted by name for that reason.
 */
import { Pool } from "pg";
import { loadEnv } from "../src/lib/env";

loadEnv();

if (process.env.NODE_ENV === "production") {
  console.error("db:clear refuses to run with NODE_ENV=production.");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL?.trim() });
try {
  const { rows } = await pool.query<{ table_name: string }>(
    `select table_name from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE'`,
  );
  if (rows.length === 0) {
    console.log("db:clear — no tables (run db:migrate first)");
  } else {
    const names = rows.map((r) => `"${r.table_name}"`).join(", ");
    await pool.query(`truncate ${names} restart identity cascade`);
    const seqs = await pool.query<{ sequencename: string }>(
      `select sequencename from pg_sequences where schemaname = 'public'`,
    );
    for (const s of seqs.rows) await pool.query(`alter sequence "${s.sequencename}" restart`);
    console.log(
      `db:clear — emptied ${rows.length} table(s), restarted ${seqs.rows.length} sequence(s)`,
    );
  }
} catch (err) {
  console.error("db:clear failed:", err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await pool.end();
}
