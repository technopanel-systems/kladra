/**
 * The quotations file (SPEC §3, P14 14.10; P13 before it).
 *
 * Quotations with their items and their services — one row per panel line and
 * one per service, the quotation repeated on each.
 *
 * `line` says which a row is, `panel` or `service`, and `item` is its number
 * within its own kind, as the drawer numbers them. A service row names the
 * service and leaves the sheet's columns empty; a panel row leaves `service`
 * empty. Panels come first, then services, as on the paper (SPEC §3, P13).
 *
 * A service's m² is in a column of its own, `service_sqm`, never in `sqm`: a
 * pivot that sums `sqm` is summing panel sold, and a service's m² is the area it
 * is done over, which no figure counts (D173). `price_per_sqm` and `line_total`
 * are shared, because services are money and a quotation's money is both.
 *
 * It is the quotations SCREEN, exported. The same narrowing
 * (`narrowQuotations`), fed from the address with the screen's own parsers, so a
 * rep's file is a rep's floor, a search or a status chip narrows the file
 * exactly as it narrows the list he is looking at, and a door opened from a
 * figure on the metrics tab carries that figure's cohort into the file (S32) —
 * earlier revisions and all, because the cohort counts every revision as its own
 * trip through the chain. Uncapped, where the list is capped at two hundred
 * (D80): a screen is read from the top and a file is added up.
 *
 * One hand-written statement rather than a query built column by column,
 * because the panels and the services are a UNION read back through an alias —
 * the shape rules/data.md warns answers the underlying column names. The tables
 * carry their own names and no letters, which is what lets the screen's
 * conditions, written against the Drizzle tables, stand in the WHERE of a
 * statement written as text.
 */
import { and, sql } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { STATUS_KEYS } from "@/components/quotations/status-words";
import { db } from "@/db";
import type { Day } from "@/lib/dates";
import { asSearch, exportDay, type ExportRead } from "@/lib/export/kit";
import { quotationLabel } from "@/lib/labels";
import { parseNarrowing } from "@/lib/narrowing";
import { personNameOf } from "@/lib/people";
import { narrowQuotations, parseQuotationStatus, type QuotationStatus } from "@/lib/quotations";
import { parseView } from "@/lib/view";

export const quotationsSheet: ExportRead = async ({ user, locale, params }) => {
  const ar = locale.startsWith("ar");
  // The one lookup on these rows that has two names. The rest of what a line
  // reads as — supplier N/K/C/D, class, fire rating, thickness in millimetres —
  // is the same code in both languages (S32), which is why the statement below
  // picks no word for them.
  const serviceName = sql.raw(ar ? "sv.name_ar" : "sv.name_en");

  // A board of states shows every state, so a status chip is not in force on
  // one and the page drops it there; the file from a board is the board. Only
  // the address is read for it: the remembered choice behind it belongs to a
  // person and a file is built from the address the screen sent.
  const board = parseView(params.get("view")) === "board";

  // `and` answers undefined when every condition is, which cannot happen here —
  // the latest-revision rule is always one of them — but a WHERE with nothing
  // after it does not parse, so the type is answered rather than asserted away.
  const narrowed =
    and(
      ...narrowQuotations({
        user,
        locale,
        q: params.get("q")?.trim() || undefined,
        status: board ? undefined : parseQuotationStatus(params.get("status")),
        cohort: parseNarrowing(asSearch(params)) ?? undefined,
      }),
    ) ?? sql`true`;

  const [t, result] = await Promise.all([
    getTranslations({ locale }),
    db.execute<Record<string, unknown>>(sql`
      select quotations.number as q_number,
             quotations.revision as q_revision,
             coalesce(quotations.smac_number, '') as smac_number,
             quotations.status as status,
             companies.name as company,
             projects.name as project,
             ${personNameOf("users", locale)} as rep,
             to_char((quotations.created_at at time zone 'Asia/Riyadh')::date, 'YYYY-MM-DD') as requested,
             to_char((quotations.issued_at at time zone 'Asia/Riyadh')::date, 'YYYY-MM-DD') as issued,
             l.line,
             l.item,
             l.service,
             l.colour_code,
             l.supplier,
             l.fire_rating,
             l.class,
             l.thickness_mm,
             l.width_m,
             l.length_m,
             l.qty,
             l.sqm,
             l.service_sqm,
             l.price_per_sqm,
             l.line_total
        from quotations
        join companies on companies.id = quotations.company_id
        join users on users.id = quotations.rep_id
        join projects on projects.id = quotations.project_id
        join (
          select qi.quotation_id,
                 1 as kind,
                 'panel' as line,
                 qi.position as item,
                 null::text as service,
                 qi.colour_code,
                 s.code as supplier,
                 fr.name as fire_rating,
                 cl.name as class,
                 th.mm::text as thickness_mm,
                 qi.width::text as width_m,
                 qi.length::text as length_m,
                 qi.qty::text as qty,
                 qi.sqm::text as sqm,
                 null::text as service_sqm,
                 qi.price_per_sqm as price_per_sqm,
                 round(qi.sqm * qi.price_per_sqm, 2) as line_total
            from quotation_items qi
            join suppliers s on s.id = qi.supplier_id
            join fire_ratings fr on fr.id = qi.fire_rating_id
            join classes cl on cl.id = qi.class_id
            join thicknesses th on th.id = qi.thickness_id
          union all
          select qs.quotation_id,
                 2 as kind,
                 'service' as line,
                 qs.position as item,
                 ${serviceName} as service,
                 null, null, null, null, null, null, null, null, null,
                 qs.sqm::text as service_sqm,
                 qs.price_per_sqm as price_per_sqm,
                 round(qs.sqm * qs.price_per_sqm, 2) as line_total
            from quotation_services qs
            join services sv on sv.id = qs.service_id
        ) l on l.quotation_id = quotations.id
       where ${narrowed}
       order by quotations.number, quotations.revision, l.kind, l.item
    `),
  ]);

  return {
    columns: [
      "quotation",
      "smac_number",
      "status",
      "company",
      "project",
      "rep",
      "requested",
      "issued",
      "line",
      "item",
      "service",
      "colour_code",
      "supplier",
      "fire_rating",
      "class",
      "thickness_mm",
      "width_m",
      "length_m",
      "qty",
      "sqm",
      "service_sqm",
      "price_per_sqm",
      "line_total",
    ],
    // What a pivot adds up. Not the item, which is a line's number and not a
    // quantity of anything; not the two references, which are digits that stay
    // text (src/lib/csv.ts).
    numeric: [
      "thickness_mm",
      "width_m",
      "length_m",
      "qty",
      "sqm",
      "service_sqm",
      "price_per_sqm",
      "line_total",
    ],
    rows: result.rows.map((row) => ({
      ...row,
      // Which kind of row this is, in a word rather than in the token the
      // statement unions on: every other cell on the row is in the reader's
      // language and this one was "panel" in both (P14 14.10).
      line: row.line === "panel" ? t("quotations.panel") : t("quotations.service"),
      // The label is built by the function every screen uses, never spelled out
      // in SQL beside it: "Q-8" and "Q-8/2" is one rule (src/lib/labels.ts).
      quotation: quotationLabel(Number(row.q_number), Number(row.q_revision)),
      // And the status in the word the badge on that row says (STATUS_KEYS), so
      // the file and the screen call the same thing the same thing.
      status: t(STATUS_KEYS[row.status as QuotationStatus]),
      requested: exportDay(row.requested as Day | null, locale),
      issued: exportDay(row.issued as Day | null, locale),
    })),
  };
};
