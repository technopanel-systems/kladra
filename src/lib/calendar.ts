/**
 * The non-working days the working-day math needs (SPEC S47, S48).
 *
 * `src/lib/workdays.ts` owns the arithmetic and is pure — it takes the days as
 * an argument so it can be reasoned about and tested without a database. This
 * is the one place that loads them.
 *
 * Company holidays have no user; a person's leave has one. Both are skipped by
 * pace and by reminders, because a rep back from two weeks off must not be told
 * he is behind (S48).
 *
 * No `import "server-only"`, for the reason in src/lib/live.ts.
 */
import { and, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { nonWorkingDays } from "@/db/schema";
import type { Day } from "@/lib/dates";
import type { NonWorking } from "@/lib/workdays";

/** Every holiday and every person's leave between two Riyadh days, inclusive. */
export async function listNonWorkingDays(from: Day, to: Day): Promise<NonWorking[]> {
  const rows = await db
    .select({ day: nonWorkingDays.day, userId: nonWorkingDays.userId })
    .from(nonWorkingDays)
    .where(and(gte(nonWorkingDays.day, from), lte(nonWorkingDays.day, to)));
  return rows.map((row) => ({ day: row.day, userId: row.userId ?? null }));
}
