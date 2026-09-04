/**
 * The three CSV exports (SPEC D19, §3: admin only).
 *
 * UTF-8 with a byte-order mark, because Excel on Windows reads a BOM-less UTF-8
 * file as the system codepage and turns every Arabic name into mojibake. That
 * is the single most common way a correct export is reported as a broken one.
 *
 * CRLF line endings for the same reason: Excel is the reader here, not a
 * terminal.
 *
 * Everything is one flat table per file, joined already — an accountant opening
 * this does not want to look a supplier up in a second sheet.
 *
 * No `import "server-only"`, for the reason in src/lib/live.ts.
 */
import { sql } from "drizzle-orm";
import { db } from "@/db";

export const EXPORTS = ["companies", "quotations", "dispatches"] as const;
export type ExportName = (typeof EXPORTS)[number];

export function isExportName(value: unknown): value is ExportName {
  return typeof value === "string" && (EXPORTS as readonly string[]).includes(value);
}

/** One CSV cell: quoted always, so a comma, a quote or a newline is safe. */
function cell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  return `"${String(value).replace(/"/g, '""')}"`;
}

/** The whole file, with its header row. */
function csv(headers: string[], rows: Record<string, unknown>[]): string {
  const lines = [headers.map(cell).join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => cell(row[header])).join(","));
  }
  // The BOM is what makes Excel read it as UTF-8 (D19).
  return "﻿" + lines.join("\r\n") + "\r\n";
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
      left join contacts ct on ct.id = (
        select ct2.id from contacts ct2
         where ct2.company_id = c.id and ct2.archived_at is null
         order by ct2.is_main desc, ct2.created_at asc
         limit 1
      )
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
    select case when q.revision > 1 then 'Q-' || q.number || '/' || q.revision
                else 'Q-' || q.number end as quotation,
           coalesce(q.smac_number, '') as smac_number,
           q.status as status,
           c.name as company,
           coalesce(p.name, '') as project,
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
      left join projects p on p.id = q.project_id
     order by q.number, q.revision, qi.position
  `);

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
    result.rows,
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
    select 'D-' || d.number as dispatch,
           coalesce(d.smac_dispatch_number, '') as smac_dispatch_number,
           d.status as status,
           case when q.revision > 1 then 'Q-' || q.number || '/' || q.revision
                else 'Q-' || q.number end as quotation,
           coalesce(q.smac_number, '') as quotation_smac_number,
           c.name as company,
           coalesce(p.name, '') as project,
           u.name as rep,
           sm.name_en as shipment,
           d.destination as destination,
           d.payment_terms as payment_terms,
           to_char((d.created_at at time zone 'Asia/Riyadh')::date, 'YYYY-MM-DD') as requested,
           to_char((d.approved_at at time zone 'Asia/Riyadh')::date, 'YYYY-MM-DD') as approved,
           qi.position as item,
           qi.colour_code as colour_code,
           qi.qty as quoted_qty,
           di.qty as sent_qty,
           round(qi.width * qi.length * di.qty, 2) as sqm
      from dispatches d
      join quotations q on q.id = d.quotation_id
      join companies c on c.id = q.company_id
      join users u on u.id = d.rep_id
      join shipment_methods sm on sm.id = d.shipment_method_id
      join dispatch_items di on di.dispatch_id = d.id
      join quotation_items qi on qi.id = di.quotation_item_id
      left join projects p on p.id = q.project_id
     order by d.number, qi.position
  `);

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
      "requested",
      "approved",
      "item",
      "colour_code",
      "quoted_qty",
      "sent_qty",
      "sqm",
    ],
    result.rows,
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
