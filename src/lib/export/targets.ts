/**
 * The targets file (SPEC §3, P14 14.10; S43, S44 before it).
 *
 * One row per person per month: the figure they were measured against and the
 * figure they moved. The sheet somebody opens when the question is not "how is
 * August going" but "how did the year go", which is the one question the
 * targets screen cannot answer, because a screen is read across and a year is
 * read down.
 *
 * **Achieved is not restated here.** There is one definition of an achieved
 * metre in this app — approved dispatch items, in the Riyadh month the approval
 * fell in, divided between the people CREDITED on the dispatch (D148) — and it
 * lives in `achievedByRep` (src/lib/dispatches.ts). This file asks that
 * function, once per month, rather than writing the sum a second way: a second
 * arithmetic for "achieved, but historically" is exactly how a figure ends up
 * with two answers, and the six bars on the metrics tab nearly got theirs that
 * way (src/lib/months.ts). A month somebody had a target in and moved nothing
 * is a nought, not an empty cell; a month with no target is empty, because a
 * blank box is no target and never a target of nothing (S45).
 *
 * It is the targets SCREEN, exported, and that screen has no address at all:
 * the month is Riyadh's and nothing in a link can move it (P13), so there is
 * nothing here to read a parameter with. What it does have is a cap — the
 * newest twelve months underneath this one's boxes, with a line saying how many
 * there are (D80) — and the file has none: a screen is read from the top and a
 * file is added up.
 *
 * A row exists where a target was set, plus everybody who carries metres this
 * month, target or not, because those are the rows the screen draws its boxes
 * for. `CARRIES_METRES` is the sentence that says who they are, asked rather
 * than copied (D44). One hand-written statement because the months come out of
 * two tables through a UNION, which a query builder reads back by the wrong
 * column names (rules/data.md); the tables carry their own names and no
 * letters, so that sentence, written against the Drizzle table, stands in the
 * WHERE of a statement written as text.
 *
 * **And one row a month that is nobody's**: the company's own target and what
 * the company moved, at the head of its month, because that is the top of the
 * screen this file is (S44) and it would otherwise be the one figure on it the
 * file does not carry. It is named by leaving the person empty — the way a
 * company holiday is on the leave file, the same idiom landed in the same slice
 * — and `shares` is empty on it, because sharing a paper's metres is something
 * a person does and not something a company does. Its achieved figure comes
 * from `companyAchievedSqm`, which is what the team screen asks, and never from
 * adding the people's up: a paper credited to two of them is one load and not
 * two (D148).
 *
 * Nobody's own floor and nobody's own screen, so the gate is the admin's:
 * `requireAdmin` is what the page asks, and the registry asks the same of the
 * file. A target is the figure a person is measured against, and who may read
 * everybody's is not who may read his own.
 */
import { sql } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import { firstOfMonth, formatMonth, todayRiyadh, type Day } from "@/lib/dates";
import { achievedByRep, companyAchievedSqm } from "@/lib/dispatches";
import type { ExportRead } from "@/lib/export/kit";
import { personNameOf } from "@/lib/people";
import { CARRIES_METRES } from "@/lib/team";

export const targetsSheet: ExportRead = async ({ locale }) => {
  // One today for the whole file, so a file built across midnight on the last
  // of the month cannot list this month among the earlier ones.
  const current = firstOfMonth(todayRiyadh());

  const [t, result] = await Promise.all([
    getTranslations({ locale }),
    db.execute<{
      month: Day;
      user_id: string;
      person: string;
      target_sqm: string | null;
      shares: boolean;
    }>(sql`
      with months as (
        select distinct listed.m
          from (
            select targets.month as m from targets
            union all
            select company_targets.month from company_targets
            union all
            select ${current}::date
          ) listed
         where listed.m <= ${current}::date
      )
      select to_char(months.m, 'YYYY-MM-DD') as month,
             ${personNameOf("users", locale)} as person,
             targets.sqm::text as target_sqm,
             coalesce(targets.shares, false) as shares,
             users.id::text as user_id
        from months
        cross join users
        left join targets on targets.month = months.m and targets.user_id = users.id
       where targets.user_id is not null
          or (months.m = ${current}::date and users.active and ${CARRIES_METRES})
       order by months.m desc, person
    `),
  ]);

  // Newest month first, each month once, in the order the statement answered.
  const months = [...new Set(result.rows.map((row) => row.month))];
  // THE definition of achieved, asked once per month (S43) — the people's from
  // `achievedByRep`, the company's from `companyAchievedSqm`, which is what the
  // team screen asks for its own two halves and never a sum of the first.
  const achieved = new Map(
    await Promise.all(
      months.map(async (month) => [month, await achievedByRep(month)] as const),
    ),
  );
  const forCompany = new Map(
    await Promise.all(
      months.map(
        async (month) => [month, await companyAchievedSqm(month)] as const,
      ),
    ),
  );
  const companyTarget = new Map(
    (
      await db.execute<{ month: Day; sqm: string }>(
        sql`select to_char(company_targets.month, 'YYYY-MM-DD') as month,
                   company_targets.sqm::text as sqm
              from company_targets`,
      )
    ).rows.map((row) => [row.month, row.sqm] as const),
  );

  return {
    columns: ["month", "person", "target_sqm", "achieved_sqm", "shares"],
    numeric: ["target_sqm", "achieved_sqm"],
    rows: months.flatMap((month) => [
      // The company's own line first, as it is the top of that screen.
      {
        // A month a person reads, the way every month heading in the app is
        // written: "Aug 2026", Western digits in both languages (D6).
        month: formatMonth(month, locale),
        person: "",
        target_sqm: companyTarget.get(month) ?? "",
        achieved_sqm: forCompany.get(month) ?? "0",
        shares: "",
      },
      ...result.rows
        .filter((row) => row.month === month)
        .map((row) => ({
          month: formatMonth(row.month, locale),
          person: row.person,
          target_sqm: row.target_sqm,
          achieved_sqm: achieved.get(row.month)?.get(row.user_id) ?? "0",
          // The tick beside the box: this person shares a paper's metres even
          // with no target of their own (P14), yes or no like every other flag
          // column in these files.
          shares: t(row.shares ? "export.yes" : "export.no"),
        })),
    ]),
  };
};
