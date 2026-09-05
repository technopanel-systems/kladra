import { Pool } from "pg";
import { loadEnv, testDatabaseUrl } from "@/lib/env";

/**
 * Direct Postgres access for specs, for state the screen genuinely does not
 * show (an audit row, a value DESIGN.md keeps off screen). Live updates are
 * asserted through the UI in a second browser context, never by polling here
 * (WORKFLOW.md §3) — this is an escape hatch, not the default way to check
 * something.
 *
 * loadEnv() runs here rather than importing `@/db`: that module builds its
 * singleton pool while it is being imported, reading `process.env.DATABASE_URL`
 * before this file's own loadEnv() would ever run.
 */
loadEnv();

let pool: Pool | null = null;

/**
 * Built on first use, not on import, so a spec that merely imports a sibling
 * helper never opens a connection. `allowExitOnIdle` lets the Playwright
 * worker exit once its clients go idle — an always-open pool keeps the event
 * loop alive and stalls the end of the run.
 */
function getPool(): Pool {
  if (pool) return pool;
  // The suite's own database, never the developer's (src/lib/env.ts).
  const connectionString = testDatabaseUrl();
  // workers: 1 in playwright.config.ts, so a small pool is plenty.
  pool = new Pool({ connectionString, max: 4, allowExitOnIdle: true });
  return pool;
}

export async function query<Row extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params: readonly unknown[] = [],
): Promise<Row[]> {
  const result = await getPool().query(text, params as unknown[]);
  return result.rows as Row[];
}

/** Exactly one row, or a named failure — the shape most assertions want. */
export async function one<Row extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params: readonly unknown[] = [],
): Promise<Row> {
  const rows = await query<Row>(text, params);
  if (rows.length !== 1) {
    throw new Error(`Expected exactly 1 row, got ${rows.length}: ${text}`);
  }
  return rows[0];
}

/**
 * A seeded user's id by email — for telling two same-named rows apart, not for
 * building ID-bearing URLs (DESIGN.md: internal codes and IDs never appear, so
 * navigation stays role/label/text-driven).
 */
export async function userId(email: string): Promise<string> {
  const rows = await query<{ id: string }>("select id from users where email = $1::text", [email]);
  if (rows.length === 0) {
    throw new Error(`No seeded user with email ${email} — did seed:demo run?`);
  }
  return rows[0].id;
}

/**
 * The name a screen in this language shows for an account (SPEC D68).
 *
 * A person has a Latin name and, usually, an Arabic one, and the screens resolve
 * which by the reader's language — so a spec that hard-codes "Faisal Al-Harbi"
 * passes in English and fails in Arabic for the right reason. Specs ask for the
 * name the way `src/lib/people.ts` does.
 */
export async function personName(email: string, locale: string): Promise<string> {
  const column = locale.startsWith("ar") ? "coalesce(nullif(name_ar, ''), name)" : "name";
  const rows = await query<{ name: string }>(
    `select ${column} as name from users where email = $1::text`,
    [email],
  );
  if (rows.length === 0) {
    throw new Error(`No seeded user with email ${email} — did seed:demo run?`);
  }
  return rows[0].name;
}

/** Closes the pool. Only a one-off script outside a Playwright run needs this. */
export async function closePool(): Promise<void> {
  if (!pool) return;
  const closing = pool;
  pool = null;
  await closing.end();
}
