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

/**
 * Everything a hand-over moves, as it stood before it moved.
 *
 * `handOverCompanyAction` moves the company, and since P12 the departing rep's
 * projects and contacts under it as well; it archives a contact whose number
 * the new owner already holds, clears the main flag on the ones that arrive
 * when he already has a main, and drops his share of what he now owns
 * (src/actions/companies.ts). A spec that hands a company over and afterwards
 * puts back only `companies.rep_id` leaves the floor half moved: the people
 * under the customer belong to a rep who no longer owns him, and every spec
 * that runs after it reads a floor the seed never wrote.
 *
 * That cost five failures in one run and none of them named the cause — a
 * duplicate phone that was no longer a duplicate, a "his own contact" step
 * where the contact was already his, and a Log button the drawer was right to
 * withhold. So the floor is captured before the move and restored BY ID, each
 * row to the state it was actually in.
 */
export type CompanyFloor = {
  companyId: string;
  /** Whose the company was. */
  repId: string;
  projects: { id: string; repId: string }[];
  contacts: { id: string; repId: string; isMain: boolean; archivedAt: Date | null }[];
  /** Who could see it, and who let them — the share rows the move may delete. */
  shares: { userId: string; grantedBy: string }[];
};

export async function floorOfCompany(companyId: string): Promise<CompanyFloor> {
  const owner = await one<{ repId: string }>(
    'select rep_id as "repId" from companies where id = $1::uuid',
    [companyId],
  );
  return {
    companyId,
    repId: owner.repId,
    projects: await query<{ id: string; repId: string }>(
      'select id, rep_id as "repId" from projects where company_id = $1::uuid',
      [companyId],
    ),
    contacts: await query<{ id: string; repId: string; isMain: boolean; archivedAt: Date | null }>(
      `select id, rep_id as "repId", is_main as "isMain", archived_at as "archivedAt"
         from contacts where company_id = $1::uuid`,
      [companyId],
    ),
    shares: await query<{ userId: string; grantedBy: string }>(
      `select user_id as "userId", granted_by as "grantedBy"
         from company_shares where company_id = $1::uuid`,
      [companyId],
    ),
  };
}

export async function restoreCompanyFloor(floor: CompanyFloor): Promise<void> {
  await query("update companies set rep_id = $1::uuid where id = $2::uuid", [
    floor.repId,
    floor.companyId,
  ]);
  for (const project of floor.projects) {
    await query("update projects set rep_id = $1::uuid where id = $2::uuid", [
      project.repId,
      project.id,
    ]);
  }
  for (const contact of floor.contacts) {
    // The main flag and the archive stamp move in a hand-over too, so putting
    // back the rep alone would leave a company with two main contacts or one
    // archived for no reason anybody could read.
    await query(
      `update contacts
          set rep_id = $1::uuid, is_main = $2::boolean, archived_at = $3::timestamptz
        where id = $4::uuid`,
      [contact.repId, contact.isMain, contact.archivedAt, contact.id],
    );
  }
  for (const share of floor.shares) {
    await query(
      `insert into company_shares (company_id, user_id, granted_by)
            values ($1::uuid, $2::uuid, $3::uuid)
       on conflict (company_id, user_id) do nothing`,
      [floor.companyId, share.userId, share.grantedBy],
    );
  }
}

/** Closes the pool. Only a one-off script outside a Playwright run needs this. */
export async function closePool(): Promise<void> {
  if (!pool) return;
  const closing = pool;
  pool = null;
  await closing.end();
}
