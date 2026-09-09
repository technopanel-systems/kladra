/**
 * Moving somebody's people from one place to another (D153, P12-8).
 *
 * Two acts in the app do this and they are the same act: a hand-over, which
 * moves a rep's contacts to the rep taking his company, and a fold, which moves
 * a rep's contacts onto the record that continues when two turn out to be one
 * customer. Both land rows on a `(company, rep)` pair that may already hold
 * rows of its own, and both meet the same two unique indexes: one number per rep
 * per company, and one main contact per rep per company.
 *
 * The rule is D153's, written once here rather than twice:
 *
 * - **The row that stands is the one already there.** It was written by the man
 *   receiving these people, about a person he has been ringing, and moving
 *   somebody else's row over it would silently rewrite a year of his notes.
 * - **The arriving duplicate is archived where it is**, not deleted (S16), and
 *   keeps the name of the rep who wrote it, because an archived row is history
 *   and history keeps its author.
 * - **No arriving row displaces a main contact he has already chosen.** A
 *   company has one main contact per rep (D18, D147), and his choice is not
 *   overruled by a move he did not ask for.
 *
 * Live rows only. An archived contact stays where it is in both acts: it is a
 * record of who somebody was talking to, and it reads with his name on it
 * wherever it still reads.
 *
 * No `import "server-only"`, for the reason in src/lib/live.ts.
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Tx } from "@/db";
import { contacts } from "@/db/schema";

/** A rep's list of people on one company — the thing being moved, and the thing moved onto. */
export type ContactList = { companyId: string; repId: string };

export async function moveContacts(tx: Tx, from: ContactList, to: ContactList): Promise<void> {
  const already = await tx
    .select({
      phoneNormalized: contacts.phoneNormalized,
      isMain: contacts.isMain,
      archivedAt: contacts.archivedAt,
    })
    .from(contacts)
    // Archived ones too: `contacts_company_phone_idx` does not exempt them, so a
    // number he once held here is still a number that cannot arrive.
    .where(and(eq(contacts.companyId, to.companyId), eq(contacts.repId, to.repId)));

  const taken = already.map((row) => row.phoneNormalized);
  // Only a LIVE main occupies the slot: `contacts_one_main_idx` is partial, and
  // an archived row that used to be his main blocks nothing.
  const hasMain = already.some((row) => row.isMain && row.archivedAt === null);

  const mine = and(
    eq(contacts.companyId, from.companyId),
    eq(contacts.repId, from.repId),
    isNull(contacts.archivedAt),
  );

  if (taken.length > 0) {
    await tx
      .update(contacts)
      .set({ archivedAt: new Date() })
      .where(and(mine, inArray(contacts.phoneNormalized, taken)));
  }

  await tx
    .update(contacts)
    .set({
      companyId: to.companyId,
      repId: to.repId,
      ...(hasMain ? { isMain: false } : {}),
    })
    // Re-asked rather than reused: the statement above has just taken some of
    // these rows out of the set, and a second `where` that did not notice would
    // move the very rows it archived.
    .where(mine);
}
