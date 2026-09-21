/**
 * The leads file (SPEC §3, P14 14.10; P12-7 and P13 before it).
 *
 * One row per lead: the customer marketing brought in, where it is, what it was
 * asked for in the finder's own words, who found it, whose floor it went to, the
 * day it was passed and the day it was picked up. The file is about the
 * HANDOVER — everything else about the customer is the customers file, because
 * a lead is a company and there is no second table (src/lib/leads.ts).
 *
 * `passed` is the day the lead reached the person holding it NOW — the day it
 * was filed, or the day the manager last gave it to somebody else — asked of
 * `GIVEN_AT`, the one definition of it, so a file and the manager's red rows
 * cannot age the same lead differently. `acknowledged` is empty while nobody
 * has said he has it, which is the whole question this screen exists to ask.
 *
 * `category` and `lead_source` are joined already, as on the customers file: an
 * accountant opening this does not want to look a segment up in a second sheet.
 * Nothing on these rows is a figure, so nothing is declared numeric — how long
 * a lead has sat is working days, counted in TypeScript against the holiday
 * table (D141), and a number in a file that a spreadsheet would re-sort by is
 * not the same promise as a badge that is recomputed every time it is drawn.
 *
 * It is the leads SCREEN, exported. The same narrowing (`narrowLeads`), read
 * from the address with the screen's own parser, so marketing's file is what
 * marketing brought in and the manager's is everybody's, and a person chip or
 * the Not acknowledged chip narrows the file exactly as it narrows the list.
 * The same order too — unacknowledged first and oldest of those at the top, the
 * rest newest first — so the first row of the file is the first row of the
 * screen. Uncapped, where the list stops at its limit (D80): a screen is read
 * from the top and a file is added up.
 *
 * One hand-written statement rather than a query built column by column,
 * because a lead names two people and the two `users` aliases the join needs
 * are the screen's own, written as text beside `GIVEN_AT`'s own correlated
 * subquery. `companies` carries its own name and no letter, which is what lets
 * the screen's conditions, written against the Drizzle table, stand in the
 * WHERE of a statement written as text.
 *
 * No `import "server-only"`, for the reason in src/lib/live.ts.
 */
import { sql } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { parseLeadQuery } from "@/components/leads/lead-view";
import { STAGE_KEYS } from "@/components/leads/stage-words";
import { db } from "@/db";
import { riyadhDay, type Day } from "@/lib/dates";
import { asSearch, exportDay, type ExportRead } from "@/lib/export/kit";
import { GIVEN_AT, LEAD_STAGE, narrowLeads, type LeadStage } from "@/lib/leads";
import { personNameOf } from "@/lib/people";

export const leadsSheet: ExportRead = async ({ user, locale, params }) => {
  const t = await getTranslations({ locale });
  const ar = locale.startsWith("ar");
  // The three lookups on these rows that carry two names.
  const cityName = sql.raw(ar ? "cities.name_ar" : "cities.name_en");
  const categoryName = sql.raw(ar ? "company_categories.name_ar" : "company_categories.name_en");
  const sourceName = sql.raw(ar ? "lead_sources.name_ar" : "lead_sources.name_en");

  // `and` answers undefined when every condition is, which cannot happen here —
  // a lead is always a row with a finder on it and never an archived one — but
  // a WHERE with nothing after it does not parse, so the type is answered
  // rather than asserted away.
  const narrowed = narrowLeads(user, parseLeadQuery(asSearch(params))) ?? sql`true`;

  const result = await db.execute<Record<string, unknown>>(sql`
    select companies.name as company,
           -- The city as the record holds it: a lookup where it is one, the
           -- typed name where the country is not Saudi Arabia (SPEC §3).
           coalesce(${cityName}, companies.city_text, '') as city,
           ${categoryName} as category,
           ${sourceName} as lead_source,
           coalesce(companies.lead_query, '') as query,
           ${personNameOf("finder", locale)} as found_by,
           ${personNameOf("holder", locale)} as given_to,
           ${riyadhDay(GIVEN_AT)} as passed,
           ${riyadhDay(sql`companies.lead_acknowledged_at`)} as acknowledged,
           -- How far it got, from the one expression the screen's badge and the
           -- manager's count both read (LEAD_STAGE, D182) — never a second
           -- CASE beside it.
           ${LEAD_STAGE} as stage
      from companies
      join users finder on finder.id = companies.lead_from_id
      join users holder on holder.id = companies.rep_id
      join company_categories on company_categories.id = companies.category_id
      join lead_sources on lead_sources.id = companies.lead_source_id
      left join cities on cities.id = companies.city_id
     where ${narrowed}
     order by (companies.lead_acknowledged_at is not null),
              case when companies.lead_acknowledged_at is null then ${GIVEN_AT} end asc,
              companies.created_at desc
  `);

  return {
    columns: [
      "company",
      "city",
      "category",
      "lead_source",
      "query",
      "found_by",
      "given_to",
      "passed",
      "acknowledged",
      "stage",
    ],
    rows: result.rows.map((row) => ({
      ...row,
      passed: exportDay(row.passed as Day | null, locale),
      acknowledged: exportDay(row.acknowledged as Day | null, locale),
      // The word the badge on that row says (src/components/leads/stage-words.ts).
      stage: t(STAGE_KEYS[row.stage as LeadStage]),
    })),
  };
};
