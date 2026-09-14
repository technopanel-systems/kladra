import { test, expect } from "@playwright/test";
import { query } from "./helpers/db";
import { RAISED_FOR_ROLES } from "@/lib/floor";
import { RANGES, rangeStart } from "@/lib/ranges";
import {
  HABIT_AT_LEAST,
  HABIT_SHARE_PERCENT,
  RELIANCE_SQL,
  relianceCounts,
  relianceOf,
  reliancePercent,
  relianceWord,
  type RelianceCounts,
  type ReliancePaper,
  type RelianceSqlRow,
} from "@/lib/reliance";

/**
 * How often each rep relies on the coordinator (SPEC §3 P13).
 *
 * Three things held to each other: the rule that turns two counts into a word,
 * the pure function that counts a person's paper from rows, and the statement
 * the card runs. The card is not on a screen yet — the team tab wires it in —
 * so this is where its figures are proved: the statement is run here exactly as
 * the reader runs it, and compared with SQL written in this file and with the
 * twin fed every paper in the database.
 */

test("reliance is a word: a habit at a quarter of the paper and at least three, occasional short of that, never at none", () => {
  // The line SPEC §4 records, as the constants that draw it.
  expect(HABIT_SHARE_PERCENT).toBe(25);
  expect(HABIT_AT_LEAST).toBe(3);

  expect(relianceWord(0, 0)).toBe("none");
  expect(relianceWord(0, 14)).toBe("none");
  // All of one paper is not a habit: one is not a pattern.
  expect(relianceWord(1, 1)).toBe("occasional");
  expect(relianceWord(2, 2)).toBe("occasional");
  // Exactly a quarter, and three: on the habit side, with no rounding to argue about.
  expect(relianceWord(3, 12)).toBe("habit");
  expect(relianceWord(3, 13)).toBe("occasional");
  expect(relianceWord(4, 17)).toBe("occasional");
  expect(relianceWord(5, 20)).toBe("habit");

  expect(reliancePercent(3, 11)).toBe(27);
  expect(reliancePercent(0, 0)).toBe(0);
  expect(relianceOf({ userId: "a", quotations: 8, raisedQuotations: 2, dispatches: 4, raisedDispatches: 1 })).toEqual({
    raised: 3,
    total: 12,
    percent: 25,
    word: "habit",
  });
});

test("the pure twin counts each person's paper in the window and the part somebody else raised", () => {
  const from = "2026-09-01";
  const papers: ReliancePaper[] = [
    // Faisal's own, in the window.
    { kind: "quotation", repId: "faisal", raisedById: "faisal", createdOn: "2026-09-01" },
    // Raised for him, in the window, a quotation and a dispatch.
    { kind: "quotation", repId: "faisal", raisedById: "rawan", createdOn: "2026-09-10" },
    { kind: "dispatch", repId: "faisal", raisedById: "rawan", createdOn: "2026-09-12" },
    // Raised for him the day before the window opens: not counted at all.
    { kind: "dispatch", repId: "faisal", raisedById: "rawan", createdOn: "2026-08-31" },
    // Saad's own load.
    { kind: "dispatch", repId: "saad", raisedById: "saad", createdOn: "2026-09-03" },
    // Her own paper, under Internal Sales: she is not one of the people counted.
    { kind: "quotation", repId: "rawan", raisedById: "rawan", createdOn: "2026-09-04" },
  ];

  expect(relianceCounts(["faisal", "saad", "turki"], papers, from)).toEqual([
    { userId: "faisal", quotations: 2, raisedQuotations: 1, dispatches: 1, raisedDispatches: 1 },
    { userId: "saad", quotations: 0, raisedQuotations: 0, dispatches: 1, raisedDispatches: 0 },
    // Somebody with nothing in the window is a row of noughts, not a missing row.
    { userId: "turki", quotations: 0, raisedQuotations: 0, dispatches: 0, raisedDispatches: 0 },
  ]);
});

/** This file's own count, written without the reader's statement in sight. */
async function countedHere(from: string): Promise<RelianceCounts[]> {
  const rows = await query<RelianceSqlRow>(
    `select u.id::text as user_id,
            (select count(*)::int from quotations q
              where q.rep_id = u.id
                and (q.created_at at time zone 'Asia/Riyadh')::date >= $1::date) as quotations,
            (select count(*)::int from quotations q
              where q.rep_id = u.id and q.raised_by_id <> q.rep_id
                and (q.created_at at time zone 'Asia/Riyadh')::date >= $1::date) as raised_quotations,
            (select count(*)::int from dispatches d
              where d.rep_id = u.id
                and (d.created_at at time zone 'Asia/Riyadh')::date >= $1::date) as dispatches,
            (select count(*)::int from dispatches d
              where d.rep_id = u.id and d.raised_by_id <> d.rep_id
                and (d.created_at at time zone 'Asia/Riyadh')::date >= $1::date) as raised_dispatches
       from users u
      where u.active and u.role in ('rep', 'marketing')`,
    [from],
  );
  return rows.map(countsOf);
}

function countsOf(row: RelianceSqlRow): RelianceCounts {
  return {
    userId: row.user_id,
    quotations: row.quotations,
    raisedQuotations: row.raised_quotations,
    dispatches: row.dispatches,
    raisedDispatches: row.raised_dispatches,
  };
}

/** One order for both sides, by code unit: a collation would be a third opinion. */
const byUser = (rows: RelianceCounts[]) =>
  [...rows].sort((a, b) => (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0));

test("the reader's statement counts what SQL written here counts, in every window", async () => {
  const papers = await query<ReliancePaper>(
    `select 'quotation' as kind, rep_id::text as "repId", raised_by_id::text as "raisedById",
            to_char((created_at at time zone 'Asia/Riyadh')::date, 'YYYY-MM-DD') as "createdOn"
       from quotations
     union all
     select 'dispatch', rep_id::text, raised_by_id::text,
            to_char((created_at at time zone 'Asia/Riyadh')::date, 'YYYY-MM-DD')
       from dispatches`,
  );

  for (const range of RANGES) {
    const from = rangeStart(range);
    await test.step(`${range}, from ${from}`, async () => {
      // The statement the card runs, with the parameters the reader gives it.
      const read = (await query<RelianceSqlRow>(RELIANCE_SQL, [from, RAISED_FOR_ROLES])).map(countsOf);
      const here = await countedHere(from);

      expect(read.length, "the reader counted nobody").toBeGreaterThan(0);
      expect(byUser(read)).toEqual(byUser(here));
      // And the twin, fed every paper there is, agrees with both.
      expect(byUser(relianceCounts(here.map((row) => row.userId), papers, from))).toEqual(
        byUser(here),
      );

      // The largest share first, so a habit is at the top of the card.
      const shares = read.map((row) => {
        const { raised, total } = relianceOf(row);
        return total === 0 ? -1 : raised / total;
      });
      expect(shares).toEqual([...shares].sort((a, b) => b - a));
    });
  }
});
