/**
 * Two records, one customer (P12-8, S14, S15, D158).
 *
 * S15 is the rule everything here is built around: a company is ALWAYS created,
 * even when it looks like a duplicate, and nothing blocks the rep. That is a
 * property of the detector, not of its absence — the row is written, and then
 * the flag is, inside the same transaction, and nobody standing in a lobby with
 * a customer beside him is asked a question he cannot answer.
 *
 * The number raises the flag and the name never does (D158). One telephone
 * number is one company, in this trade as in any other; a name lookalike is
 * ordinary here — Riyadh is full of firms whose names differ by one word — and a
 * queue of pairs that are not duplicates is a queue the manager learns to clear
 * without reading. So the name warns the REP, in `findPossibleDuplicates`,
 * where he is looking at the customer's card and can settle it in a second; the
 * number tells the MANAGER, here, because deciding whose customer this is was
 * always his (§3, and `mayHandOver`).
 *
 * No `import "server-only"`, for the reason in src/lib/live.ts.
 */
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getLocale } from "next-intl/server";
import { db, type Db, type Tx } from "@/db";
import {
  activities,
  companies,
  contacts,
  duplicateFlags,
  projects,
  quotations,
  users,
  NOTIFICATION_KINDS,
  type DuplicateFlagStatus,
} from "@/db/schema";
import { moveContacts } from "@/lib/contacts";
import type { Day } from "@/lib/dates";
import { clearNotifications, createNotification } from "@/lib/notify";
import { personNameOf } from "@/lib/people";
import { formatPhone, storedE164 } from "@/lib/phone";

/**
 * Raise a flag for every live company that holds a number this one holds.
 *
 * Called inside the transaction that just wrote the company or the contact, so
 * the flag and the row it is about commit together: a company can never exist
 * for a moment with a number the manager was not told about.
 *
 * The insert IS the deduplication. `duplicate_flags_pair_idx` allows one row per
 * pair for ever, whichever way round it arrives, so a pair the manager has
 * already ruled `notDuplicate` is refused by the index rather than by a read
 * before the write — which is what "a false duplicate is remembered so the same
 * pair is never raised again" means, with no second table and no window between
 * the read and the write in which the same pair is raised twice.
 *
 * `distinct on` because two contacts on one company can carry one number, and a
 * statement that offers the same pair twice is not the index's job to catch.
 *
 * BOTH companies have to be on the floor. A record somebody archived is not a
 * question about whose customer this is — there is nothing left to fold and
 * nobody is ringing him — and a pair drawn with one side already off the floor
 * would be asking the manager to choose between a customer and a filing
 * decision. That also keeps a folded record out: a tombstone is archived, so
 * the pair that ruled it is in the table and never offered again.
 */
export async function flagDuplicates(tx: Tx | Db, companyId: string): Promise<void> {
  await tx.execute(sql`
    insert into duplicate_flags (company_id, other_id, matched_phone)
    select distinct on (other.id) ${companyId}::uuid, other.id, mine.phone_normalized
      from contacts mine
      join contacts theirs
        on theirs.phone_normalized = mine.phone_normalized
       and theirs.company_id <> mine.company_id
       and theirs.archived_at is null
      join companies other
        on other.id = theirs.company_id
       and other.archived_at is null
     where mine.company_id = ${companyId}::uuid
       and mine.archived_at is null
       and mine.phone_normalized is not null
       and exists (
         select 1 from companies me
          where me.id = ${companyId}::uuid and me.archived_at is null
       )
     order by other.id, mine.phone_normalized
    on conflict do nothing
  `);
}

/** One side of a pair: the record, and what is already on it. */
export type DuplicateSide = {
  id: string;
  name: string;
  repId: string;
  repName: string;
  city: string | null;
  /** The Riyadh day the record was opened. */
  addedOn: Day;
  /** The last thing anybody wrote about this customer, or null. */
  lastActivityOn: Day | null;
  /** What would move if this one did not continue. */
  has: { contacts: number; projects: number; quotations: number; dispatches: number };
};

/**
 * A pair waiting on the manager.
 *
 * `older` and `newer` rather than "this one and that one": the manager is
 * deciding which record continues, and the one that has been on the floor
 * longer is usually the one with the history on it. Naming them by age puts the
 * question in the order he answers it, and it is read off the days themselves
 * rather than off whichever column the detector happened to write each in.
 */
export type DuplicatePair = {
  id: string;
  /** The number both of them held when it was raised, ready to read. */
  phone: string;
  /** The Riyadh day it was raised, so the screen can age it like everything else. */
  raisedOn: Day;
  older: DuplicateSide;
  newer: DuplicateSide;
};

/**
 * A pair still waiting on the manager.
 *
 * Open, and both records still on the floor. A rep who archives one of them has
 * settled it in practice — there is nothing left to fold and nobody is ringing
 * that customer — so it leaves his screen without leaving the table, which is
 * what stops the detector offering the pair a second time. Both the figure and
 * the list ask this one predicate: a count and a list that disagree about what
 * they are counting is the figure-that-lies (rules/data.md).
 */
const OPEN = and(
  eq(duplicateFlags.status, "open" satisfies DuplicateFlagStatus),
  sql`exists (select 1 from companies a where a.id = ${duplicateFlags.companyId} and a.archived_at is null)`,
  sql`exists (select 1 from companies b where b.id = ${duplicateFlags.otherId} and b.archived_at is null)`,
);

/** How many pairs are waiting on the manager — the figure beside the heading. */
export async function countOpenDuplicates(): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(duplicateFlags)
    .where(OPEN);
  return row?.total ?? 0;
}

/**
 * The open pairs, whole, side by side, oldest first.
 *
 * Both records are described by the same six subqueries, so neither side can be
 * described better than the other — a screen that showed the arriving record its
 * projects and the other one nothing would be putting a thumb on the scale of a
 * decision it exists to inform.
 */
export async function listOpenDuplicates(limit: number): Promise<DuplicatePair[]> {
  const locale = await getLocale();
  const a = alias(companies, "a");
  const b = alias(companies, "b");
  const repA = alias(users, "rep_a");
  const repB = alias(users, "rep_b");
  const cityName = locale.startsWith("ar") ? sql`ci.name_ar` : sql`ci.name_en`;

  // One description, asked twice. `sql.raw` takes the alias because it is a
  // table name and not a value; nothing a person typed reaches it.
  const facts = (side: "a" | "b") => {
    const t = sql.raw(side);
    return {
      city: sql<string | null>`(
        select coalesce(${cityName}, ${t}.city_text) from cities ci where ci.id = ${t}.city_id
      )`,
      // The row's own day, in Riyadh, which is the day the manager would say it
      // arrived (rules/data.md).
      addedOn: sql<Day>`to_char((${t}.created_at at time zone 'Asia/Riyadh')::date, 'YYYY-MM-DD')`,
      lastActivityOn: sql<Day | null>`(
        select max(ac.happened_on) from activities ac
         where ac.company_id = ${t}.id and ac.archived_at is null
      )`,
      contacts: sql<number>`(
        select count(*)::int from contacts ct
         where ct.company_id = ${t}.id and ct.archived_at is null
      )`,
      projects: sql<number>`(
        select count(*)::int from projects pr
         where pr.company_id = ${t}.id and pr.archived_at is null
      )`,
      quotations: sql<number>`(
        select count(*)::int from quotations qu where qu.company_id = ${t}.id
      )`,
      // Approved only: what actually moved is what makes a record worth keeping.
      dispatches: sql<number>`(
        select count(*)::int from dispatches di
          join quotations qu on qu.id = di.quotation_id
         where qu.company_id = ${t}.id and di.status = 'approved'
      )`,
    };
  };

  const fa = facts("a");
  const fb = facts("b");

  const rows = await db
    .select({
      id: duplicateFlags.id,
      phone: duplicateFlags.matchedPhone,
      raisedOn: sql<Day>`to_char((${duplicateFlags.createdAt} at time zone 'Asia/Riyadh')::date, 'YYYY-MM-DD')`,
      aId: a.id,
      aName: a.name,
      aRepId: a.repId,
      aRepName: personNameOf("rep_a", locale),
      aCity: fa.city,
      aAddedOn: fa.addedOn,
      aLastActivityOn: fa.lastActivityOn,
      aContacts: fa.contacts,
      aProjects: fa.projects,
      aQuotations: fa.quotations,
      aDispatches: fa.dispatches,
      bId: b.id,
      bName: b.name,
      bRepId: b.repId,
      bRepName: personNameOf("rep_b", locale),
      bCity: fb.city,
      bAddedOn: fb.addedOn,
      bLastActivityOn: fb.lastActivityOn,
      bContacts: fb.contacts,
      bProjects: fb.projects,
      bQuotations: fb.quotations,
      bDispatches: fb.dispatches,
    })
    .from(duplicateFlags)
    .innerJoin(a, eq(a.id, duplicateFlags.companyId))
    .innerJoin(b, eq(b.id, duplicateFlags.otherId))
    .innerJoin(repA, eq(repA.id, a.repId))
    .innerJoin(repB, eq(repB.id, b.repId))
    .where(OPEN)
    .orderBy(duplicateFlags.createdAt)
    .limit(limit);

  return rows.map((row) => {
    const sideA: DuplicateSide = {
      id: row.aId,
      name: row.aName,
      repId: row.aRepId,
      repName: row.aRepName,
      city: row.aCity,
      addedOn: row.aAddedOn,
      lastActivityOn: row.aLastActivityOn,
      has: {
        contacts: row.aContacts,
        projects: row.aProjects,
        quotations: row.aQuotations,
        dispatches: row.aDispatches,
      },
    };
    const sideB: DuplicateSide = {
      id: row.bId,
      name: row.bName,
      repId: row.bRepId,
      repName: row.bRepName,
      city: row.bCity,
      addedOn: row.bAddedOn,
      lastActivityOn: row.bLastActivityOn,
      has: {
        contacts: row.bContacts,
        projects: row.bProjects,
        quotations: row.bQuotations,
        dispatches: row.bDispatches,
      },
    };
    const [older, newer] = sideA.addedOn <= sideB.addedOn ? [sideA, sideB] : [sideB, sideA];
    return {
      id: row.id,
      phone: formatPhone(storedE164(row.phone)),
      raisedOn: row.raisedOn,
      older,
      newer,
    };
  });
}

/**
 * Move everything under one record onto another and leave a tombstone (P12-8).
 *
 * A write, in a file of reads, for one reason: the demo seed folds a pair so
 * that the tombstone band on a drawer, the sentence on the archive screen and
 * the two bells are branches somebody has actually seen (rules/data.md). A seed
 * that folded by hand would be a second answer to what folding IS, and the one
 * that drifts is the one nobody runs against a screen.
 *
 * Order matters in one place only: the contacts move per rep, because the two
 * unique indexes they meet are keyed on `(company, rep)` and a folded record on
 * a shared company carries rows belonging to more than one person.
 *
 * What does NOT move is as deliberate as what does. A project keeps its own rep
 * and a quotation keeps the person it credits (D148), so folding two records
 * never moves a square metre from one month to another; the log keeps who wrote
 * each entry (S27); and the audit rows and the notices already written against
 * the folded record stay pointing at it, which is why it is a tombstone rather
 * than a deletion.
 */
export async function foldCompany(
  tx: Tx,
  what: { survivorId: string; foldedId: string; share: boolean; actorId: string },
): Promise<void> {
  const { survivorId, foldedId } = what;

  /*
   * Both rows held before anything decides (D85), and held in ONE statement
   * ordered by id rather than two in the caller's order: two folds that shared a
   * company and took their locks the other way round would each hold what the
   * other was waiting for. One order for everybody is what makes that
   * impossible rather than unlikely.
   */
  const held = await tx
    .select({ id: companies.id, repId: companies.repId, nextFollowUp: companies.nextFollowUp })
    .from(companies)
    .where(inArray(companies.id, [survivorId, foldedId]))
    .orderBy(asc(companies.id))
    .for("update");
  const survivor = held.find((row) => row.id === survivorId);
  const folded = held.find((row) => row.id === foldedId);
  if (!survivor || !folded) throw new Error("fold: one of the pair is gone");

  // Everybody who has people on the folded record: its own rep, and anybody it
  // was shared with who added contacts of his own (D147).
  const owners = await tx
    .selectDistinct({ repId: contacts.repId })
    .from(contacts)
    .where(and(eq(contacts.companyId, foldedId), isNull(contacts.archivedAt)));
  for (const owner of owners) {
    await moveContacts(
      tx,
      { companyId: foldedId, repId: owner.repId },
      { companyId: survivorId, repId: owner.repId },
    );
  }

  await tx.update(projects).set({ companyId: survivorId }).where(eq(projects.companyId, foldedId));
  await tx
    .update(activities)
    .set({ companyId: survivorId })
    .where(eq(activities.companyId, foldedId));
  await tx
    .update(quotations)
    .set({ companyId: survivorId })
    .where(eq(quotations.companyId, foldedId));

  /*
   * A promise made to this customer does not vanish because two records became
   * one. The company's own next follow-up is set by its latest log entry (D9)
   * and those entries have just moved; the sooner of the two dates is the one
   * somebody actually said out loud, so it wins. `least` ignores nulls, which
   * is the answer for a record nobody has dated.
   */
  await tx
    .update(companies)
    .set({ nextFollowUp: sql`least(${companies.nextFollowUp}, ${folded.nextFollowUp})` })
    .where(eq(companies.id, survivorId));

  if (what.share) {
    /*
     * Everybody who could see the folded record can see the one that continues.
     * Never its own rep — a person does not share a company he owns — and never
     * a second row for somebody already on it.
     */
    await tx.execute(sql`
      insert into company_shares (company_id, user_id, granted_by)
      select ${survivorId}::uuid, holder, ${what.actorId}::uuid
        from (
          select ${folded.repId}::uuid as holder
          union
          select cs.user_id from company_shares cs where cs.company_id = ${foldedId}::uuid
        ) held
       where holder <> ${survivor.repId}::uuid
      on conflict do nothing
    `);
  }

  // The tombstone. Archived by construction — `companies_merged_check` refuses
  // the row otherwise — so every list in the app stops drawing it without one of
  // them being told about folding. No archive reason: `merged_into_id` IS the
  // reason, and it reads in whichever language the reader is in, which a
  // sentence stored in a column never does (D13).
  await tx
    .update(companies)
    .set({ mergedIntoId: survivorId, archivedAt: new Date() })
    .where(eq(companies.id, foldedId));

  /*
   * The notices about the folded record are about work that has stopped
   * existing (D79). A lead nobody acknowledged is the sharpest case: its bell
   * points at a company that is now history, and the button that would clear it
   * is on a record nobody should press anything on.
   */
  await clearNotifications(tx, { type: "company", id: foldedId }, NOTIFICATION_KINDS);

  // Both sides are told, and they are told two different things, because two
  // different things happened to them (S53).
  if (folded.repId !== what.actorId && folded.repId !== survivor.repId) {
    await createNotification(tx, {
      userId: folded.repId,
      kind: "companyFolded",
      params: { repId: survivor.repId },
      // His own record, archived, which still opens and says what it became.
      link: `/companies?open=${foldedId}`,
      subject: { type: "company", id: foldedId },
    });
  }
  if (survivor.repId !== what.actorId) {
    await createNotification(tx, {
      userId: survivor.repId,
      kind: "companyAbsorbed",
      // No second name in the row: the customer in the sentence is joined from
      // the subject at read time (D110), and the record that folded in is a
      // tombstone its reader has no reason to be sent to.
      params: { repId: what.actorId },
      link: `/companies?open=${survivorId}`,
      subject: { type: "company", id: survivorId },
    });
  }
}
