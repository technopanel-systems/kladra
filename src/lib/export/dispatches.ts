/**
 * The dispatches file (SPEC §3, P14 14.10; P13 before it).
 *
 * Dispatches with their items and their services — one row per panel line and
 * one per service, the load repeated on each, as the quotations file is laid out
 * (SPEC §3 P13: a dispatch carries the same inputs as its quotation, and any
 * difference is "recorded for later analysis").
 *
 * `line` says which a row is, `panel` or `service`, and `item` is its number
 * within its own kind, as the drawer numbers them — a carried line keeps its
 * quotation's number. A panel row carries the whole sheet as the load sent it,
 * which on a direct load or a changed line is not the paper's; a service row
 * names the service and leaves the sheet empty.
 *
 * `sqm` is the quantity SENT times the line's own sheet — what actually moved,
 * the figure the month is measured by (S37, S43) — and a service's m² is in
 * `service_sqm`, never in `sqm`, so a pivot that sums `sqm` sums panels (D173).
 *
 * `source` is the quotation the load was prefilled from, or the word the list
 * itself uses for a load with no paper. The `difference` is on the load's FIRST
 * row only, so a filter on it finds each differing load once and a count of it
 * counts loads, not lines.
 *
 * It is the dispatches SCREEN, exported. The same narrowing
 * (`narrowDispatches`), fed from the address with the screen's own parsers, so a
 * rep's file is a rep's floor, a search or a status chip narrows the file
 * exactly as it narrows the list he is looking at, and a door opened from a
 * figure on the metrics tab carries the loads that figure counted (D148).
 * Uncapped, where the list is capped at two hundred (D80): a screen is read from
 * the top and a file is added up.
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
import { STATUS_KEYS } from "@/components/dispatches/status-words";
import { db } from "@/db";
import type { Day } from "@/lib/dates";
import { narrowDispatches, parseDispatchStatus, type DispatchStatus } from "@/lib/dispatches";
import { differenceInWords, type Difference } from "@/lib/dispatch-difference";
import { asSearch, exportDay, type ExportRead } from "@/lib/export/kit";
import { dispatchLabel, quotationLabel } from "@/lib/labels";
import { parseNarrowing } from "@/lib/narrowing";
import {
  isPaymentDetail,
  isPaymentTerms,
  paymentDetailLabel,
  paymentTermsLabel,
} from "@/lib/payment";
import { personNameOf } from "@/lib/people";
import { chosen, rememberedChoices } from "@/lib/screen-choice";
import { LINE_SQM } from "@/lib/sqm";
import { viewFor } from "@/lib/view";

export const dispatchesSheet: ExportRead = async ({ user, locale, params }) => {
  const ar = locale.startsWith("ar");
  // The lookups on these rows that carry two names. What a panel line reads as
  // — supplier N/K/C/D, class, fire rating, thickness in millimetres — is the
  // same code in both languages (S32) and is picked no word for below.
  const storeName = sql.raw(ar ? "warehouses.name_ar" : "warehouses.name_en");
  const extraStoreName = sql.raw(ar ? "w2.name_ar" : "w2.name_en");
  const shipmentName = sql.raw(ar ? "shipment_methods.name_ar" : "shipment_methods.name_en");
  const serviceName = sql.raw(ar ? "sv.name_ar" : "sv.name_en");

  // A board of states shows every state, so a status chip is not in force on
  // one and the page drops it there; the file from a board is the board. The
  // view is read the way the PAGE reads it — the address first, the person's
  // remembered choice behind it (D164) — because a screen standing on a bare
  // address is showing whichever of the two he last chose, and a file that
  // ignored that would not be the screen it came from.
  const board =
    viewFor(params.get("view") ?? undefined, chosen(await rememberedChoices(user.id), "view", "dispatches")) ===
    "board";

  // `and` answers undefined when every condition is, which cannot happen here —
  // a reader who sees every load is still narrowed to the customers nobody has
  // archived — but a WHERE with nothing after it does not parse, so the type is
  // answered rather than asserted away.
  const narrowed =
    and(
      ...narrowDispatches({
        user,
        locale,
        q: params.get("q")?.trim() || undefined,
        status: board ? undefined : parseDispatchStatus(params.get("status")),
        moved: parseNarrowing(asSearch(params)) ?? undefined,
      }),
    ) ?? sql`true`;

  const [t, result, serviceRows, warehouseRows] = await Promise.all([
    getTranslations({ locale }),
    db.execute<Record<string, unknown>>(sql`
      select dispatches.id as d_id,
             dispatches.number as d_number,
             coalesce(dispatches.smac_dispatch_number, '') as smac_dispatch_number,
             dispatches.status as status,
             quotations.number as q_number,
             quotations.revision as q_revision,
             coalesce(quotations.smac_number, '') as quotation_smac_number,
             dispatches.quotation_difference as difference_json,
             companies.name as company,
             coalesce(projects.name, '') as project,
             ${personNameOf("users", locale)} as rep,
             -- Where it left from: the load's own store, and the rare second
             -- and third after it, in the order the rep named them (P14). The
             -- one place that reads dispatch_warehouses in SQL rather than
             -- through src/lib/warehouses.ts, because this is one statement
             -- over every load the filter admits and that file answers one
             -- paper at a time.
             ${storeName} || coalesce(' | ' || (
               select string_agg(${extraStoreName}, ' | ' order by dw.position)
                 from dispatch_warehouses dw
                 join warehouses w2 on w2.id = dw.warehouse_id
                where dw.dispatch_id = dispatches.id), '') as warehouse,
             ${shipmentName} as shipment,
             dispatches.destination as destination,
             dispatches.payment_terms as payment_terms,
             coalesce(dispatches.payment_detail::text, '') as payment_detail,
             coalesce(dispatches.payment_note, '') as payment_note,
             to_char((dispatches.created_at at time zone 'Asia/Riyadh')::date, 'YYYY-MM-DD') as requested,
             to_char((dispatches.approved_at at time zone 'Asia/Riyadh')::date, 'YYYY-MM-DD') as approved,
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
             l.quoted_qty,
             l.sent_qty,
             l.sqm,
             l.service_sqm,
             l.price_per_sqm,
             l.line_total
        from dispatches
        join companies on companies.id = dispatches.company_id
        join users on users.id = dispatches.rep_id
        join warehouses on warehouses.id = dispatches.warehouse_id
        join shipment_methods on shipment_methods.id = dispatches.shipment_method_id
        -- A direct dispatch has no paper and may have no job (SPEC §3, P13).
        left join quotations on quotations.id = dispatches.quotation_id
        left join projects on projects.id = dispatches.project_id
        join (
          select di.dispatch_id,
                 1 as kind,
                 'panel' as line,
                 di.position as item,
                 null::text as service,
                 di.colour_code,
                 s.code as supplier,
                 fr.name as fire_rating,
                 cl.name as class,
                 th.mm::text as thickness_mm,
                 di.width::text as width_m,
                 di.length::text as length_m,
                 qi.qty::text as quoted_qty,
                 di.qty::text as sent_qty,
                 -- The line's generated column, the one the screens and the
                 -- month read (src/lib/sqm.ts), so the file cannot disagree
                 -- with the drawer (D38).
                 (${sql.raw(LINE_SQM)})::text as sqm,
                 null::text as service_sqm,
                 di.price_per_sqm::text as price_per_sqm,
                 round(${sql.raw(LINE_SQM)} * di.price_per_sqm, 2)::text as line_total
            from dispatch_items di
            join suppliers s on s.id = di.supplier_id
            join fire_ratings fr on fr.id = di.fire_rating_id
            join classes cl on cl.id = di.class_id
            join thicknesses th on th.id = di.thickness_id
            left join quotation_items qi on qi.id = di.quotation_item_id
          union all
          select ds.dispatch_id,
                 2 as kind,
                 'service' as line,
                 ds.position as item,
                 ${serviceName} as service,
                 null, null, null, null, null, null, null, null, null, null,
                 ds.sqm::text as service_sqm,
                 ds.price_per_sqm::text as price_per_sqm,
                 round(ds.sqm * ds.price_per_sqm, 2)::text as line_total
            from dispatch_services ds
            join services sv on sv.id = ds.service_id
        ) l on l.dispatch_id = dispatches.id
       where ${narrowed}
       order by dispatches.number, l.kind, l.item
    `),
    // Every service, switched off or not: a load may carry one the admin has
    // since retired, and the difference names it by id. In the reader's
    // language, because the sentence it is printed inside is.
    db.execute<{ id: string; name: string }>(
      sql`select id::text as id, ${sql.raw(ar ? "name_ar" : "name_en")} as name from services`,
    ),
    // And every store, for the same reason: the difference names the ones the
    // load moved away from (P14).
    db.execute<{ id: string; name: string }>(
      sql`select id::text as id, ${sql.raw(ar ? "name_ar" : "name_en")} as name from warehouses`,
    ),
  ]);

  const serviceNames = new Map(serviceRows.rows.map((row) => [row.id, row.name]));
  const namedService = (id: string) => serviceNames.get(id) ?? id;
  const storeNames = new Map(warehouseRows.rows.map((row) => [row.id, row.name]));
  const namedStore = (id: string) => storeNames.get(id) ?? id;

  /**
   * How much and when, in the reader's words, from the same two functions the
   * drawer and the form use (src/lib/payment.ts). Guarded rather than cast: the
   * column is an enum today and a word out of the database is still a word
   * somebody may have added to that enum without telling this file.
   */
  const terms = (value: unknown) => (isPaymentTerms(value) ? paymentTermsLabel(value, t) : "");
  const detail = (value: unknown) => (isPaymentDetail(value) ? paymentDetailLabel(value, t) : "");

  // The labels from the functions the screens use (src/lib/labels.ts).
  let previous: unknown = null;
  const rows = result.rows.map((row) => {
    const first = row.d_id !== previous;
    previous = row.d_id;
    return {
      ...row,
      // Which kind of row this is, in a word rather than in the token the
      // statement unions on: every other cell on the row is in the reader's
      // language and this one was "panel" in both (P14 14.10).
      line: row.line === "panel" ? t("quotations.panel") : t("quotations.service"),
      dispatch: dispatchLabel(Number(row.d_number)),
      status: t(STATUS_KEYS[row.status as DispatchStatus]),
      source:
        row.q_number === null
          ? t("dispatches.direct")
          : quotationLabel(Number(row.q_number), Number(row.q_revision)),
      /**
       * What differed, in the reader's language, from the same function and the
       * same words the drawer says it with (src/lib/dispatch-difference.ts).
       */
      difference: first
        ? differenceInWords(row.difference_json as Difference[] | null, t, namedService, namedStore)
        : "",
      payment_terms: terms(row.payment_terms),
      payment_detail: detail(row.payment_detail),
      requested: exportDay(row.requested as Day | null, locale),
      approved: exportDay(row.approved as Day | null, locale),
    };
  });

  return {
    columns: [
      "dispatch",
      "smac_dispatch_number",
      "status",
      "source",
      "quotation_smac_number",
      "company",
      "project",
      "rep",
      "warehouse",
      "shipment",
      "destination",
      "payment_terms",
      "payment_detail",
      "payment_note",
      "requested",
      "approved",
      "difference",
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
      "quoted_qty",
      "sent_qty",
      "sqm",
      "service_sqm",
      "price_per_sqm",
      "line_total",
    ],
    // What a pivot adds up. Not the item, which is a line's number and not a
    // quantity of anything; not the two SMAC references, which are digits that
    // stay text (src/lib/csv.ts).
    numeric: [
      "thickness_mm",
      "width_m",
      "length_m",
      "quoted_qty",
      "sent_qty",
      "sqm",
      "service_sqm",
      "price_per_sqm",
      "line_total",
    ],
    rows,
  };
};
