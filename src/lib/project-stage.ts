/**
 * Where a project stands in its own life — the projects board's five columns
 * (SPEC §3 P13, D170).
 *
 * Nobody types a stage. It is read off the project's own papers at the moment
 * the board is drawn, so a card moves because something happened to the job —
 * a price went out, a load was approved, the rep marked it lost — and never
 * because somebody dragged it. The same word stands in the list's status column,
 * so "Open" means one thing on both views of one screen (rules/words.md).
 *
 * One definition with two faces, the shape `src/lib/credit.ts` has: the SQL that
 * every reader asks (`projectStageSql`, resolved in the query, before any limit)
 * and the pure rule that SQL spells out (`projectStage`), which a unit spec asks
 * directly for every branch and the board spec asks with facts it counts for
 * itself. The two are written beside each other so they cannot be read apart.
 *
 * Pure apart from the `sql` fragments: no database, no `server-only`, so a
 * client component may import the stage list and a spec may import the rule.
 *
 * The words the rule is written in:
 *
 * - A **standing paper** is the live revision of a quotation number (the newest,
 *   S34) whose status is still in play: requested, sent back, issued or accepted.
 *   A rejected or withdrawn one stands for nothing.
 * - A standing paper is **priced** once any revision of its number has been
 *   issued: the customer holds a price, even while a revision of it is on the
 *   desk.
 * - A line has **sheets to go** while its quantity is more than the approved
 *   loads have carried from it. Approved only — a load waiting at the desk has
 *   not left the building. This is not "left to send" (D12), which counts a
 *   waiting load as spent because it answers what a new request may still ask
 *   for; this answers what has actually gone.
 */
import { sql, type SQL } from "drizzle-orm";

/** In the order a job lives them, which is the board's order left to right (inline start to end). */
export const PROJECT_STAGES = ["open", "quoted", "dispatching", "won", "lost"] as const;
export type ProjectStage = (typeof PROJECT_STAGES)[number];

export type StageFacts = {
  /** `projects.lost_at` is set. */
  lost: boolean;
  /** A priced standing paper has had an approved load against its number and still has sheets to go. */
  dispatching: boolean;
  /** Any approved load on the project at all. */
  dispatched: boolean;
  /** Some priced standing paper still has sheets to go. */
  toGo: boolean;
  /** A standing paper the customer accepted has no sheets left to go. */
  acceptedDone: boolean;
  /** Some standing paper is priced. */
  priced: boolean;
};

/**
 * The rule, first match wins.
 *
 * - **Lost** — the rep marked it lost. Nothing else matters after that (S20).
 * - **Dispatching** — goods have gone out on a paper and more of that paper is
 *   still to go.
 * - **Won** — something has gone out and either nothing priced is left to go
 *   ("everything dispatched"), or a paper the customer accepted has gone out
 *   whole ("its quotation accepted and closed") — which is what keeps a job won
 *   when a second, alternative price for it was issued and never taken.
 * - **Quoted** — the customer holds a price and none of the above.
 * - **Open** — no price is standing: nothing asked for yet, a request still on
 *   the desk for the first time, or every price rejected or withdrawn.
 */
export function projectStage(facts: StageFacts): ProjectStage {
  if (facts.lost) return "lost";
  if (facts.dispatching) return "dispatching";
  if (facts.dispatched && (!facts.toGo || facts.acceptedDone)) return "won";
  if (facts.priced) return "quoted";
  return "open";
}

/*
 * The SQL twin. Every table is named outright and every alias is its own: in a
 * correlated subquery a bare column resolves inside the inner table and the
 * condition is silently never true (rules/data.md). The outer query reads
 * `projects`, by that name.
 */

/** `q` is the live revision of its number and still in play. */
const STANDING = `q.status in ('requested', 'returned', 'issued', 'accepted')
       and not exists (
         select 1 from quotations later
          where later.number = q.number and later.revision > q.revision
       )`;

/** Some revision of `q`'s number has been issued. */
const PRICED = `exists (
         select 1 from quotations was
          where was.number = q.number and was.issued_at is not null
       )`;

/** A line of `q` with sheets still to go on approved loads. */
const TO_GO = `exists (
         select 1 from quotation_items qi
          where qi.quotation_id = q.id
            and qi.qty > (
              select coalesce(sum(di.qty), 0)
                from dispatch_items di
                join dispatches gone on gone.id = di.dispatch_id
               where di.quotation_item_id = qi.id and gone.status = 'approved'
            )
       )`;

/** An approved load against any revision of `q`'s number. */
const LOADED = `exists (
         select 1 from dispatches loaded
         join quotations lq on lq.id = loaded.quotation_id
          where lq.number = q.number and loaded.status = 'approved'
       )`;

function paper(condition: string): string {
  return `exists (
     select 1 from quotations q
      where q.project_id = projects.id
        and ${STANDING}
        and ${condition}
   )`;
}

const FACT_SQL: Record<keyof StageFacts, string> = {
  lost: "projects.lost_at is not null",
  dispatching: paper(`${PRICED} and ${LOADED} and ${TO_GO}`),
  dispatched: `exists (
     select 1 from dispatches shipped
      where shipped.project_id = projects.id and shipped.status = 'approved'
   )`,
  toGo: paper(`${PRICED} and ${TO_GO}`),
  acceptedDone: paper(`q.status = 'accepted' and not ${TO_GO}`),
  priced: paper(PRICED),
};

/** The stage of the project the outer query is reading, as text. */
export function projectStageSql(): SQL<ProjectStage> {
  const f = FACT_SQL;
  return sql<ProjectStage>`(case
    when ${sql.raw(f.lost)} then 'lost'
    when ${sql.raw(f.dispatching)} then 'dispatching'
    when ${sql.raw(f.dispatched)} and (not ${sql.raw(f.toGo)} or ${sql.raw(f.acceptedDone)}) then 'won'
    when ${sql.raw(f.priced)} then 'quoted'
    else 'open'
  end)`;
}

/**
 * The instant a project entered the stage `stage` names — every one of them is
 * knowable from the papers, so no card falls back on "last changed":
 *
 * - Lost: when it was marked lost.
 * - Dispatching: the first approved load against a paper that is still going out.
 * - Won: the latest of its last approved load and the customer's acceptance.
 * - Quoted: the first time a standing number was issued.
 * - Open: when the project was made, or when its last price was rejected or
 *   withdrawn, whichever is later.
 */
export function stageSinceSql(stage: SQL): SQL<Date | null> {
  return sql<Date | null>`(case ${stage}
    when 'lost' then projects.lost_at
    when 'dispatching' then (
      select min(sent.approved_at)
        from dispatches sent
        join quotations sq on sq.id = sent.quotation_id
        join quotations q on q.number = sq.number
       where sent.status = 'approved'
         and q.project_id = projects.id
         and ${sql.raw(STANDING)}
         and ${sql.raw(PRICED)}
         and ${sql.raw(TO_GO)}
    )
    when 'won' then greatest(
      (select max(shipped.approved_at) from dispatches shipped
        where shipped.project_id = projects.id and shipped.status = 'approved'),
      (select max(q.decided_at) from quotations q
        where q.project_id = projects.id and q.status = 'accepted' and ${sql.raw(STANDING)})
    )
    when 'quoted' then (
      select min(was.issued_at)
        from quotations q
        join quotations was on was.number = q.number
       where q.project_id = projects.id
         and ${sql.raw(STANDING)}
         and was.issued_at is not null
    )
    else greatest(
      projects.created_at,
      (select max(q.decided_at) from quotations q
        where q.project_id = projects.id
          and q.status in ('rejected', 'cancelled')
          and not exists (
            select 1 from quotations later
             where later.number = q.number and later.revision > q.revision
          ))
    )
  end)`;
}
