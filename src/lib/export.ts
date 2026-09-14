/**
 * The three CSV exports (SPEC D19, §3: admin only).
 *
 * The file itself — the byte-order mark Excel needs to read Arabic, the CRLF
 * endings, the quoting, and a typed name that Excel would otherwise run as a
 * formula — is src/lib/csv.ts; this file is the three queries.
 *
 * Everything is one flat table per file, joined already — an accountant opening
 * this does not want to look a supplier up in a second sheet.
 *
 * No `import "server-only"`, for the reason in src/lib/live.ts.
 */
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { mainContactIdSql } from "@/lib/companies";
import { csv } from "@/lib/csv";
import { differenceInEnglish, type Difference } from "@/lib/dispatch-difference";
import { dispatchLabel, quotationLabel } from "@/lib/labels";
import { LINE_SQM } from "@/lib/sqm";

export const EXPORTS = ["companies", "quotations", "dispatches"] as const;
export type ExportName = (typeof EXPORTS)[number];

export function isExportName(value: unknown): value is ExportName {
  return typeof value === "string" && (EXPORTS as readonly string[]).includes(value);
}

/**
 * Companies with their main contact — the list somebody asks for when they want
 * "everyone we know", one row per company (D19).
 */
async function companiesCsv(): Promise<string> {
  const result = await db.execute<Record<string, unknown>>(sql`
    select c.name as company,
           coalesce(ci.name_en, c.city_text, '') as city,
           co.name_en as country,
           cat.name_en as category,
           ls.name_en as lead_source,
           u.name as rep,
           ct.name as main_contact,
           ct.phone_normalized as phone,
           coalesce(ct.email, '') as email,
           coalesce(ct.position, '') as position,
           to_char((c.created_at at time zone 'Asia/Riyadh')::date, 'YYYY-MM-DD') as added,
           case when c.archived_at is null then 'no' else 'yes' end as archived
      from companies c
      join users u on u.id = c.rep_id
      join company_categories cat on cat.id = c.category_id
      join lead_sources ls on ls.id = c.lead_source_id
      join countries co on co.id = c.country_id
      left join cities ci on ci.id = c.city_id
      -- Which contact is the main one is decided in ONE place (D18): the flag
      -- alone says nobody is main once the marked contact has been archived,
      -- and a copy of that rule here would agree today and drift later.
      left join contacts ct on ct.id = ${mainContactIdSql(sql`c.id`)}
     order by c.name
  `);

  return csv(
    [
      "company",
      "city",
      "country",
      "category",
      "lead_source",
      "rep",
      "main_contact",
      "phone",
      "email",
      "position",
      "added",
      "archived",
    ],
    result.rows,
  );
}

/**
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
 */
async function quotationsCsv(): Promise<string> {
  const result = await db.execute<Record<string, unknown>>(sql`
    select q.number as q_number,
           q.revision as q_revision,
           coalesce(q.smac_number, '') as smac_number,
           q.status as status,
           c.name as company,
           p.name as project,
           u.name as rep,
           to_char((q.created_at at time zone 'Asia/Riyadh')::date, 'YYYY-MM-DD') as requested,
           to_char((q.issued_at at time zone 'Asia/Riyadh')::date, 'YYYY-MM-DD') as issued,
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
      from quotations q
      join companies c on c.id = q.company_id
      join users u on u.id = q.rep_id
      join projects p on p.id = q.project_id
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
               sv.name_en as service,
               null, null, null, null, null, null, null, null, null,
               qs.sqm::text as service_sqm,
               qs.price_per_sqm as price_per_sqm,
               round(qs.sqm * qs.price_per_sqm, 2) as line_total
          from quotation_services qs
          join services sv on sv.id = qs.service_id
      ) l on l.quotation_id = q.id
     order by q.number, q.revision, l.kind, l.item
  `);

  // The label is built by the function every screen uses, never spelled out in
  // SQL beside it: "Q-8" and "Q-8/2" is one rule (src/lib/labels.ts).
  const rows = result.rows.map((row) => ({
    ...row,
    quotation: quotationLabel(Number(row.q_number), Number(row.q_revision)),
  }));

  return csv(
    [
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
    rows,
  );
}

/**
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
 * `source` is the quotation the load was prefilled from, or `direct`. The
 * `difference` is on the load's FIRST row only, in plain English, so a filter on
 * it finds each differing load once and a count of it counts loads, not lines.
 */
async function dispatchesCsv(): Promise<string> {
  const [result, serviceRows] = await Promise.all([
    db.execute<Record<string, unknown>>(sql`
      select d.id as d_id,
             d.number as d_number,
             coalesce(d.smac_dispatch_number, '') as smac_dispatch_number,
             d.status as status,
             q.number as q_number,
             q.revision as q_revision,
             coalesce(q.smac_number, '') as quotation_smac_number,
             d.quotation_difference as difference_json,
             c.name as company,
             coalesce(p.name, '') as project,
             u.name as rep,
             w.name_en as warehouse,
             sm.name_en as shipment,
             d.destination as destination,
             d.payment_terms as payment_terms,
             coalesce(d.payment_detail::text, '') as payment_detail,
             coalesce(d.payment_note, '') as payment_note,
             to_char((d.created_at at time zone 'Asia/Riyadh')::date, 'YYYY-MM-DD') as requested,
             to_char((d.approved_at at time zone 'Asia/Riyadh')::date, 'YYYY-MM-DD') as approved,
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
        from dispatches d
        join companies c on c.id = d.company_id
        join users u on u.id = d.rep_id
        join warehouses w on w.id = d.warehouse_id
        join shipment_methods sm on sm.id = d.shipment_method_id
        -- A direct dispatch has no paper and may have no job (SPEC §3, P13).
        left join quotations q on q.id = d.quotation_id
        left join projects p on p.id = d.project_id
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
                 sv.name_en as service,
                 null, null, null, null, null, null, null, null, null, null,
                 ds.sqm::text as service_sqm,
                 ds.price_per_sqm::text as price_per_sqm,
                 round(ds.sqm * ds.price_per_sqm, 2)::text as line_total
            from dispatch_services ds
            join services sv on sv.id = ds.service_id
        ) l on l.dispatch_id = d.id
       order by d.number, l.kind, l.item
    `),
    // Every service, switched off or not: a load may carry one the admin has
    // since retired, and the difference names it by id.
    db.execute<{ id: string; name: string }>(sql`select id::text as id, name_en as name from services`),
  ]);

  const serviceNames = new Map(serviceRows.rows.map((row) => [row.id, row.name]));
  const serviceName = (id: string) => serviceNames.get(id) ?? id;

  // The labels from the functions the screens use (src/lib/labels.ts).
  let previous: unknown = null;
  const rows = result.rows.map((row) => {
    const first = row.d_id !== previous;
    previous = row.d_id;
    return {
      ...row,
      dispatch: dispatchLabel(Number(row.d_number)),
      source:
        row.q_number === null
          ? "direct"
          : quotationLabel(Number(row.q_number), Number(row.q_revision)),
      difference: first
        ? differenceInEnglish(row.difference_json as Difference[] | null, serviceName)
        : "",
    };
  });

  return csv(
    [
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
    rows,
  );
}

export async function buildExport(name: ExportName): Promise<string> {
  switch (name) {
    case "companies":
      return companiesCsv();
    case "quotations":
      return quotationsCsv();
    case "dispatches":
      return dispatchesCsv();
  }
}
