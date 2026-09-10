/**
 * What a person chose to look at, remembered for that person (SPEC §3, D164).
 *
 * §3 asks for the list-or-board choice to be "remembered per person and carried
 * in the URL". The URL half has been true since P8; the memory was a cookie,
 * which is per BROWSER — the rep who chose the board at his desk got the list
 * back on his phone. Two other choices had the same cookie and the same comment
 * explaining why a preference was not worth a table, so all three moved
 * together: one rule, one mechanism (`screen_choices`).
 *
 * The URL still wins. This is only consulted when the address says nothing,
 * which is what `viewFor`, `tabFor` and `rangeFor` have always done with the
 * cookie they read before.
 *
 * No `import "server-only"`, for the reason in src/lib/live.ts.
 */
import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { screenChoices, type ChoiceKind } from "@/db/schema";

/** The three choices a screen remembers, from the list the CHECK reads. */
export type { ChoiceKind };

/** Keyed `kind:screen`, because that is the pair a page asks for. */
export type Remembered = ReadonlyMap<string, string>;

function key(kind: ChoiceKind, screen: string): string {
  return `${kind}:${screen}`;
}

/**
 * Everything this person has chosen, in one read.
 *
 * Once per request: the day screen asks for a tab and a range, and the team
 * screen for both again, so a read per question would be four reads of a table
 * with a handful of rows in it — the fault §5 #71 counted six of on one screen.
 * `cache` keys on the id, so a page that renders two lists asks once.
 */
export const rememberedChoices = cache(async function rememberedChoices(
  userId: string,
): Promise<Remembered> {
  const rows = await db
    .select({
      kind: screenChoices.kind,
      screen: screenChoices.screen,
      choice: screenChoices.choice,
    })
    .from(screenChoices)
    .where(eq(screenChoices.userId, userId));

  return new Map(rows.map((row) => [`${row.kind}:${row.screen}`, row.choice]));
});

/**
 * One choice, or undefined — for a page to hand to its own parser.
 *
 * The word is never trusted: `parseView`, `parseTab` and `parseRange` each fall
 * back to their default when they are given one they do not know, which is why
 * `choice` is plain text in the database. A view somebody chose before a screen
 * was rebuilt is a stale word, not a broken page.
 */
export function chosen(
  remembered: Remembered | undefined,
  kind: ChoiceKind,
  screen: string,
): string | undefined {
  return remembered?.get(key(kind, screen));
}
