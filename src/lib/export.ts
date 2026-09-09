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

/** Quotations with their items — one row per item, the quotation repeated. */
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
           qi.position as item,
           qi.colour_code as colour_code,
           s.code as supplier,
           fr.name as fire_rating,
           cl.name as class,
           th.mm as thickness_mm,
           qi.width as width_m,
           qi.length as length_m,
           qi.qty as qty,
           qi.sqm as sqm,
           qi.price_per_sqm as price_per_sqm,
           round(qi.sqm * qi.price_per_sqm, 2) as line_total
      from quotations q
      join companies c on c.id = q.company_id
      join users u on u.id = q.rep_id
      join quotation_items qi on qi.quotation_id = q.id
      join suppliers s on s.id = qi.supplier_id
      join fire_ratings fr on fr.id = qi.fire_rating_id
      join classes cl on cl.id = qi.class_id
      join thicknesses th on th.id = qi.thickness_id
      join projects p on p.id = q.project_id
     order by q.number, q.revision, qi.position
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
      "item",
      "colour_code",
      "supplier",
      "fire_rating",
      "class",
      "thickness_mm",
      "width_m",
      "length_m",
      "qty",
      "sqm",
      "price_per_sqm",
      "line_total",
    ],
    rows,
  );
}

/**
 * Dispatches with their items — one row per item.
 *
 * `sqm` is the quantity SENT times the sheet, not the quotation line's own m²:
 * the whole point of the file is what actually moved (S37, S43).
 */
async function dispatchesCsv(): Promise<string> {
  const result = await db.execute<Record<string, unknown>>(sql`
    select d.number as d_number,
           coalesce(d.smac_dispatch_number, '') as smac_dispatch_number,
           d.status as status,
           q.number as q_number,
           q.revision as q_revision,
           coalesce(q.smac_number, '') as quotation_smac_number,
           c.name as company,
           p.name as project,
           u.name as rep,
           sm.name_en as shipment,
           d.destination as destination,
           d.payment_terms as payment_terms,
           coalesce(d.payment_detail::text, '') as payment_detail,
           coalesce(d.payment_note, '') as payment_note,
           to_char((d.created_at at time zone 'Asia/Riyadh')::date, 'YYYY-MM-DD') as requested,
           to_char((d.approved_at at time zone 'Asia/Riyadh')::date, 'YYYY-MM-DD') as approved,
           qi.position as item,
           qi.colour_code as colour_code,
           qi.qty as quoted_qty,
           di.qty as sent_qty,
           -- Rounded ONCE, at the end, exactly as dispatchTotals in
           -- src/lib/dispatches.ts and lineSqm in src/lib/money.ts do it. The
           -- three move together or the file disagrees with the screen (D38).
           ${sql.raw(LINE_SQM)} as sqm
      from dispatches d
      join quotations q on q.id = d.quotation_id
      join companies c on c.id = q.company_id
      join users u on u.id = d.rep_id
      join shipment_methods sm on sm.id = d.shipment_method_id
      join dispatch_items di on di.dispatch_id = d.id
      join quotation_items qi on qi.id = di.quotation_item_id
      join projects p on p.id = q.project_id
     order by d.number, qi.position
  `);

  // Both labels from the functions the screens use (src/lib/labels.ts).
  const rows = result.rows.map((row) => ({
    ...row,
    dispatch: dispatchLabel(Number(row.d_number)),
    quotation: quotationLabel(Number(row.q_number), Number(row.q_revision)),
  }));

  return csv(
    [
      "dispatch",
      "smac_dispatch_number",
      "status",
      "quotation",
      "quotation_smac_number",
      "company",
      "project",
      "rep",
      "shipment",
      "destination",
      "payment_terms",
      "payment_detail",
      "payment_note",
      "requested",
      "approved",
      "item",
      "colour_code",
      "quoted_qty",
      "sent_qty",
      "sqm",
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
