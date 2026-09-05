/**
 * Whether the team is actually using Kladra (SPEC D77, 9A item 12).
 *
 * The last thing the five days turned up, and the one that decides whether any
 * of the rest matters: adoption is what kills a CRM, and nothing in the app said
 * a word about it. A rep who stops opening it does not appear as a rep who
 * stopped opening it — he appears as a rep with no follow-ups, no log entries
 * and a quiet month, which reads like a slow week.
 *
 * Two figures per person and no third. **Opened** is the last Riyadh day he
 * signed in and had a screen answer him (`users.last_seen_on`, written by the
 * session query). **Did** is how many records he changed in the window, counted
 * from `audit_log` — every write in this app puts a row there with who and
 * when, so it is one definition for every role rather than a different verb per
 * job: a rep logs calls, the coordinator issues quotations, marketing adds
 * companies, and all three are the same question asked once.
 *
 * There is no score and no ranking (S46). Two facts a person can act on: ring
 * the one who has not opened it, and ask the one who opens it and does nothing
 * what is in his way.
 *
 * No `import "server-only"`, for the reason in src/lib/live.ts.
 */
import { sql } from "drizzle-orm";
import { getLocale } from "next-intl/server";
import { db } from "@/db";
import { diffDays, todayRiyadh, type Day } from "@/lib/dates";
import { personNameOf } from "@/lib/people";
import type { Role } from "@/lib/types";

/**
 * The window, in days. A week, because that is the sentence the founder said —
 * "who has not opened it this week" — and because a rep on four days of leave
 * must not read as somebody who has stopped.
 */
export const USE_WINDOW_DAYS = 7;

export type PersonUse = {
  userId: string;
  name: string;
  role: Role;
  /** The last day this person opened it, or null if never. */
  lastSeenOn: Day | null;
  /** Days since, or null if never. Nought is today. */
  daysSince: number | null;
  /** Records changed in the window — anything that wrote to the audit log. */
  did: number;
  /** Not at work today, so today's silence is not news (D75). */
  away: boolean;
};

export type Use = {
  people: PersonUse[];
  /** How many active people have not opened it inside the window. */
  quiet: number;
};

/**
 * Everybody active, in the reader's script, with what they have done.
 *
 * Not named for what it returns: a function called `useAnything` is a React
 * hook to every linter in the ecosystem, and this one is a query.
 *
 * Inactive accounts are left out: a deactivated person is not somebody who
 * stopped using it, he is somebody who was stopped, and the admin's user list
 * already says so.
 */
export async function whoIsUsingIt(day: Day = todayRiyadh()): Promise<Use> {
  const locale = await getLocale();

  const rows = await db.execute<{
    id: string;
    name: string;
    role: Role;
    last_seen_on: Day | null;
    did: number;
    away: boolean;
  }>(sql`
    select u.id::text as id,
           ${personNameOf("u", locale)} as name,
           u.role,
           to_char(u.last_seen_on, 'YYYY-MM-DD') as last_seen_on,
           (select count(*)
              from audit_log a
             where a.user_id = u.id
               and (a.at at time zone 'Asia/Riyadh')::date
                   > ${day}::date - ${USE_WINDOW_DAYS}::int)::int as did,
           exists (
             select 1 from non_working_days n
              where n.user_id = u.id and n.day = ${day}::date
           ) as away
      from users u
     where u.active = true
     order by 2
  `);

  const people = rows.rows.map((row) => ({
    userId: row.id,
    name: row.name,
    role: row.role,
    lastSeenOn: row.last_seen_on,
    daysSince: row.last_seen_on ? diffDays(row.last_seen_on, day) : null,
    did: Number(row.did),
    away: row.away,
  }));

  return {
    people,
    // Never opened counts as quiet: an account nobody has ever signed into is
    // the loudest version of this figure, not an exception to it.
    quiet: people.filter((person) => person.daysSince === null || person.daysSince >= USE_WINDOW_DAYS)
      .length,
  };
}
