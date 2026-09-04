/**
 * The test database, created and named in one place.
 *
 * `CREATE DATABASE` cannot run inside a transaction and cannot run from a
 * connection to the database being created, so this connects to the server's
 * maintenance database (`postgres`) with the same credentials. Idempotent: an
 * existing database is left exactly alone, because the suite clears and reseeds
 * it immediately afterwards (tests/global-setup.ts).
 */
import { Client } from "pg";
import { loadEnv, testDatabaseUrl } from "../src/lib/env";

/** The database name the suite owns — `kladra_test` unless TEST_DATABASE_URL says otherwise. */
export function testDatabaseName(): string {
  return new URL(testDatabaseUrl()).pathname.replace(/^\//, "");
}

/**
 * Creates it if it is missing. Returns its name.
 *
 * Refuses any name not ending in `_test`. The whole point of the second
 * database is that a run cannot reach the developer's data, so a typo in `.env`
 * has to fail loudly instead of quietly seeding over it.
 */
export async function ensureTestDatabase(): Promise<string> {
  loadEnv();
  const target = new URL(testDatabaseUrl());
  const name = target.pathname.replace(/^\//, "");

  if (!name.endsWith("_test")) {
    throw new Error(
      `Refusing to create "${name}": the test database's name must end in "_test". ` +
        "Check TEST_DATABASE_URL, or let it be derived from DATABASE_URL.",
    );
  }

  const maintenance = new URL(target.toString());
  maintenance.pathname = "/postgres";

  const client = new Client({ connectionString: maintenance.toString() });
  try {
    await client.connect();
    const existing = await client.query("select 1 from pg_database where datname = $1", [name]);
    if (existing.rowCount === 0) {
      // The name is validated above and comes from our own env, never from a
      // request; it still cannot be a bound parameter, because CREATE DATABASE
      // takes an identifier rather than a value.
      await client.query(`create database "${name.replace(/"/g, '""')}"`);
      console.log(`test database — created ${name}`);
    } else {
      console.log(`test database — ${name} is there`);
    }
  } finally {
    await client.end();
  }
  return name;
}
