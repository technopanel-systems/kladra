/**
 * Live updates, the write side (rules/data.md § Database rules).
 *
 * Every write others must see calls `notifyLive` INSIDE its own transaction, so
 * the notice is delivered only if the write commits and never before the row is
 * visible to the reader. `pg_notify` is transactional: a NOTIFY issued in an
 * aborted transaction is discarded, and one issued in a committed transaction
 * is delivered after commit. Calling it on `db` instead of a `tx` sends it
 * immediately, which is right only for a write that is a single statement.
 *
 * The read side is src/app/api/events/route.ts — one process-wide client on
 * LISTEN kladra, fanning payloads out to the users each one names. No polling.
 *
 * Deliberately free of `import "server-only"`: Next aliases that module at the
 * compiler level, so a plain `tsx` script (scripts/live-ping.ts, the acceptance
 * checks) cannot resolve it. Nothing here belongs in a client component — it
 * reaches for `pg` through Drizzle, which a browser bundle cannot carry.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, type Db, type Tx } from "@/db";
import { companies, companyShares, users } from "@/db/schema";
import type { LiveEvent, Role } from "@/lib/types";

/** The one LISTEN/NOTIFY channel. Both sides name it from here. */
export const LIVE_CHANNEL = "kladra";

/** What travels over the channel: the event, plus who is allowed to see it. */
export type LivePayload = { userIds: string[]; event: LiveEvent };

/**
 * Postgres refuses a NOTIFY payload of 8000 bytes or more, and refuses it
 * loudly, at the end of a transaction that has already done its real work. A
 * company touching every user would cross that line, so the recipients are cut
 * into chunks and each chunk carries the same event. 150 uuids is ~5.9 kB.
 */
const MAX_USER_IDS_PER_PAYLOAD = 150;

/**
 * Announce `event` to `userIds`. Pass the transaction that performed the write.
 * Never throws for an empty audience; it simply has nothing to say.
 */
export async function notifyLive(tx: Tx | Db, userIds: string[], event: LiveEvent): Promise<void> {
  const ids = [...new Set(userIds.filter((id) => typeof id === "string" && id.length > 0))];
  if (ids.length === 0) return;

  for (let i = 0; i < ids.length; i += MAX_USER_IDS_PER_PAYLOAD) {
    const payload: LivePayload = { userIds: ids.slice(i, i + MAX_USER_IDS_PER_PAYLOAD), event };
    // A value interpolated into `sql` binds as an untyped parameter; pg_notify
    // takes (text, text), so it is cast here rather than left to inference.
    await tx.execute(sql`select pg_notify('kladra', ${JSON.stringify(payload)}::text)`);
  }
}

/** Narrow an unknown JSON value from the channel. The listener trusts nothing. */
export function parseLivePayload(raw: string): LivePayload | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const { userIds, event } = value as { userIds?: unknown; event?: unknown };
  if (!Array.isArray(userIds) || !userIds.every((id) => typeof id === "string")) return null;
  if (typeof event !== "object" || event === null) return null;
  if (typeof (event as { type?: unknown }).type !== "string") return null;
  return { userIds: userIds as string[], event: event as LiveEvent };
}

/**
 * Everyone who must see a change land live: the rep whose row it is, whoever is
 * acting, and every active manager and admin, who see all of it (S8).
 *
 * `alsoRoles` adds the people a particular chain runs through — the coordinator
 * for a quotation or a dispatch, whose queue has to move without a refresh
 * (S9). One list, so a new screen cannot quietly tell a different set of people.
 *
 * `alsoUsers` is who else is on the company (D147). A rep shared into a customer
 * sees every row under it, so he is in the audience for every one of them — and
 * there is no refresh button to recover with (CLAUDE.md), so a change he is not
 * told about is a screen that stays wrong until he navigates away.
 */
export async function liveAudienceFor(
  repId: string,
  actorId: string,
  alsoRoles: Role[] = [],
  alsoUsers: string[] = [],
): Promise<string[]> {
  const roles: Role[] = [...new Set<Role>(["manager", "admin", ...alsoRoles])];
  const watchers = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.active, true), inArray(users.role, roles)));
  return [...new Set([repId, actorId, ...alsoUsers, ...watchers.map((watcher) => watcher.id)])];
}

/**
 * The same audience for a change to a COMPANY or anything under it, asked by
 * the company rather than by its rep (D147).
 *
 * A company can be shared now, and everyone on it reads every row beneath it —
 * so telling only its owner leaves the other rep looking at a screen that is
 * quietly out of date, with no refresh button to recover with (CLAUDE.md). The
 * owner and the share list come back in one statement, because a write path
 * should not ask two questions to answer one.
 */
export async function liveAudienceForCompany(
  companyId: string,
  actorId: string,
  alsoRoles: Role[] = [],
): Promise<string[]> {
  const [[owner], sharers] = await Promise.all([
    db.select({ repId: companies.repId }).from(companies).where(eq(companies.id, companyId)),
    db
      .select({ userId: companyShares.userId })
      .from(companyShares)
      .where(eq(companyShares.companyId, companyId)),
  ]);
  return liveAudienceFor(
    owner?.repId ?? actorId,
    actorId,
    alsoRoles,
    sharers.map((row) => row.userId),
  );
}
