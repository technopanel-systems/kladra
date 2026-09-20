import { csvCell } from "@/lib/csv";
import { differenceInEnglish, type Difference } from "@/lib/dispatch-difference";
import { dispatchLabel, quotationLabel } from "@/lib/labels";
import { lineTotal, serviceTotal } from "@/lib/money";
import { login } from "./helpers/auth";
import { one, query } from "./helpers/db";
import { test, expect } from "./helpers/i18n";

/**
 * A CSV cell is text (SPEC D96). Pure: the export is a file the admin opens in
 * Excel, and a company name that opens with `=` is a formula Excel runs on his
 * machine. The rule is small enough to state in eight cells.
 */
test("a cell Excel would run is read as text, and a number is left a number", () => {
  expect(csvCell('=HYPERLINK("http://x")')).toBe('"\'=HYPERLINK(""http://x"")"');
  expect(csvCell("@SUM(A1)")).toBe("\"'@SUM(A1)\"");
  expect(csvCell("+cmd|' /C calc'!A0")).toBe("\"'+cmd|' /C calc'!A0\"");
  expect(csvCell("-2+3")).toBe("\"'-2+3\"");
  expect(csvCell("\tstart")).toBe("\"'\tstart\"");
  // Every phone in the file, and any figure below nought.
  expect(csvCell("+966501234567")).toBe('"+966501234567"');
  expect(csvCell("-1500.50")).toBe('"-1500.50"');
  expect(csvCell(-3)).toBe('"-3"');
});

test("a quote is doubled, a comma and a newline stay inside the cell, nothing is nothing", () => {
  expect(csvCell('Al-Rajhi "Tower"')).toBe('"Al-Rajhi ""Tower"""');
  expect(csvCell("Riyadh, Olaya")).toBe('"Riyadh, Olaya"');
  expect(csvCell("two\nlines")).toBe('"two\nlines"');
  expect(csvCell(null)).toBe('""');
  expect(csvCell(undefined)).toBe('""');
});

/**
 * What differed, in the words the file prints (SPEC §3 P13: "recorded for later
 * analysis"). Pure: every kind of entry once, with its unit, and the two answers
 * that are not a list — a load with no paper and a load that matches its paper.
 */
test("a difference is written out in words with its units; a matching load says none, a direct one nothing", () => {
  const names: Record<string, string> = { "3": "CNC cutting", "4": "Fabrication" };
  const serviceName = (id: string) => names[id] ?? id;
  const stores: Record<string, string> = { "3": "Riyadh", "7": "Malham" };
  const storeName = (id: string) => stores[id] ?? id;

  expect(differenceInEnglish(null, serviceName, storeName)).toBe("");
  expect(differenceInEnglish([], serviceName, storeName)).toBe("none");

  const difference: Difference[] = [
    { kind: "line", position: 1, change: "changed", field: "supplier", from: "N", to: "K" },
    { kind: "line", position: 1, change: "changed", field: "thickness", from: "4.0", to: "3.0" },
    { kind: "line", position: 1, change: "changed", field: "width", from: "1.24", to: "1.50" },
    { kind: "line", position: 2, change: "changed", field: "pricePerSqm", from: "120.00", to: "127.00" },
    { kind: "line", position: 5, change: "added" },
    { kind: "service", position: 1, change: "changed", field: "service", from: "3", to: "4" },
    { kind: "service", position: 1, change: "changed", field: "sqm", from: "60.00", to: "45.00" },
    { kind: "service", position: 3, change: "added" },
    // The load itself: the stores it left from, named rather than numbered (P14).
    { kind: "load", change: "changed", field: "warehouses", from: "3", to: "3,7" },
  ];
  expect(differenceInEnglish(difference, serviceName, storeName)).toBe(
    [
      "Item 1 supplier changed from N to K",
      "Item 1 thickness changed from 4.0 mm to 3.0 mm",
      "Item 1 width changed from 1.24 m to 1.50 m",
      "Item 2 price changed from 120.00 SAR per m² to 127.00 SAR per m²",
      "Item 5 added, not on the quotation",
      "Service 1 changed from CNC cutting to Fabrication",
      "Service 1 area changed from 60.00 m² to 45.00 m²",
      "Service 3 added, not on the quotation",
      "Load stores changed from Riyadh to Riyadh and Malham",
    ].join("; "),
  );
});

/** The file read back the way Excel reads it: quoted cells, "" for a quote, CRLF between rows. */
function parseCsv(text: string): Record<string, string>[] {
  const body = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quoted) {
      if (ch !== '"') cell += ch;
      else if (body[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = false;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\r" && body[i + 1] === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i++;
    } else cell += ch;
  }
  const [header, ...data] = rows;
  return data.map((cells) => Object.fromEntries(header.map((name, index) => [name, cells[index]])));
}

type LoadRow = {
  line: "panel" | "service";
  item: number;
  service: string | null;
  colour_code: string | null;
  supplier: string | null;
  fire_rating: string | null;
  class: string | null;
  thickness_mm: string | null;
  width_m: string | null;
  length_m: string | null;
  quoted_qty: string | null;
  sent_qty: string | null;
  sqm: string | null;
  service_sqm: string | null;
  price_per_sqm: string;
};

/** A load's lines then its services, as the database holds them — the spec's own read, not the export's. */
async function loadRows(dispatchId: string): Promise<LoadRow[]> {
  return query<LoadRow>(
    `select 'panel' as line, di.position as item, null as service, di.colour_code,
            s.code as supplier, fr.name as fire_rating, cl.name as class, th.mm::text as thickness_mm,
            di.width::text as width_m, di.length::text as length_m,
            qi.qty::text as quoted_qty, di.qty::text as sent_qty,
            round(di.width * di.length * di.qty, 2)::text as sqm, null as service_sqm,
            di.price_per_sqm::text as price_per_sqm, 1 as kind
       from dispatch_items di
       join suppliers s on s.id = di.supplier_id
       join fire_ratings fr on fr.id = di.fire_rating_id
       join classes cl on cl.id = di.class_id
       join thicknesses th on th.id = di.thickness_id
       left join quotation_items qi on qi.id = di.quotation_item_id
      where di.dispatch_id = $1::uuid
     union all
     select 'service', ds.position, sv.name_en, null, null, null, null, null, null, null, null, null,
            null, ds.sqm::text, ds.price_per_sqm::text, 2
       from dispatch_services ds
       join services sv on sv.id = ds.service_id
      where ds.dispatch_id = $1::uuid
      order by kind, item`,
    [dispatchId],
  );
}

/**
 * One load's rows in the file against the database: one row per line and one per
 * service, in the drawer's order, the sheet as the load sent it, m² for panels
 * and services in their own columns, the money from the functions the drawer
 * uses, the source on every row and the difference on the first only.
 */
function expectLoad(
  file: Record<string, string>[],
  number: number,
  expected: { rows: LoadRow[]; source: string; difference: string },
) {
  const label = dispatchLabel(number);
  const rows = file.filter((row) => row.dispatch === label);
  expect(
    rows.map((row) => [row.line, Number(row.item)]),
    `${label}: one row per line and one per service, panels first`,
  ).toEqual(expected.rows.map((row) => [row.line, row.item]));

  rows.forEach((row, index) => {
    const want = expected.rows[index];
    expect(row.source, `${label} row ${index + 1}: source`).toBe(expected.source);
    expect(row.difference, `${label} row ${index + 1}: difference`).toBe(
      index === 0 ? expected.difference : "",
    );
    expect(row.price_per_sqm).toBe(want.price_per_sqm);
    if (want.line === "panel") {
      expect({
        service: row.service,
        colour_code: row.colour_code,
        supplier: row.supplier,
        fire_rating: row.fire_rating,
        class: row.class,
        thickness_mm: row.thickness_mm,
        width_m: row.width_m,
        length_m: row.length_m,
        quoted_qty: row.quoted_qty,
        sent_qty: row.sent_qty,
        sqm: row.sqm,
        service_sqm: row.service_sqm,
      }).toEqual({
        service: "",
        colour_code: want.colour_code,
        supplier: want.supplier,
        fire_rating: want.fire_rating,
        class: want.class,
        thickness_mm: want.thickness_mm,
        width_m: want.width_m,
        length_m: want.length_m,
        quoted_qty: want.quoted_qty ?? "",
        sent_qty: want.sent_qty,
        sqm: want.sqm,
        service_sqm: "",
      });
      const total = lineTotal({
        width: want.width_m ?? 0,
        length: want.length_m ?? 0,
        qty: want.sent_qty ?? 0,
        pricePerSqm: want.price_per_sqm,
      });
      expect(Number(row.line_total), `${label} item ${want.item}: the drawer's line total`).toBe(total);
    } else {
      // A service's m² is the area it is done over and never panel sold (D173).
      expect({ service: row.service, sqm: row.sqm, service_sqm: row.service_sqm, supplier: row.supplier }).toEqual({
        service: want.service,
        sqm: "",
        service_sqm: want.service_sqm,
        supplier: "",
      });
      const total = serviceTotal({ sqm: want.service_sqm ?? 0, pricePerSqm: want.price_per_sqm });
      expect(Number(row.line_total), `${label} service ${want.item}: the drawer's total`).toBe(total);
    }
  });
}

test("the dispatches file: a direct load and a load that left its paper, line by line and service by service", async ({
  page,
  locale,
}) => {
  test.slow(); // A sign-in and the whole file.

  // A direct load, one carrying a service where the data has one.
  const direct = await one<{ id: string; number: number }>(
    `select d.id, d.number
       from dispatches d
      where d.quotation_id is null
      order by exists (select 1 from dispatch_services ds where ds.dispatch_id = d.id) desc, d.number
      limit 1`,
  );
  // A load whose difference from its paper is recorded (the seed's D-7 kind).
  const differing = await one<{
    id: string;
    number: number;
    q_number: number;
    q_revision: number;
    difference: Difference[];
  }>(
    `select d.id, d.number, q.number as q_number, q.revision as q_revision,
            d.quotation_difference as difference
       from dispatches d
       join quotations q on q.id = d.quotation_id
      where jsonb_array_length(d.quotation_difference) > 0
      order by d.number
      limit 1`,
  );
  const names = new Map(
    (await query<{ id: string; name: string }>("select id::text as id, name_en as name from services")).map(
      (row) => [row.id, row.name],
    ),
  );
  const storeNames = new Map(
    (
      await query<{ id: string; name: string }>(
        "select id::text as id, name_en as name from warehouses",
      )
    ).map((row) => [row.id, row.name]),
  );

  await login(page, locale, "jerom");
  const response = await page.request.get("/api/export/dispatches");
  expect(response.status()).toBe(200);
  const file = parseCsv((await response.body()).toString("utf8"));

  await test.step("a direct load names its source and carries its own prices", async () => {
    const rows = await loadRows(direct.id);
    expect(rows.length).toBeGreaterThan(0);
    expectLoad(file, direct.number, { rows, source: "direct", difference: "" });
  });

  await test.step("a load that differs says how, in words, once", async () => {
    const rows = await loadRows(differing.id);
    const difference = differenceInEnglish(
      differing.difference,
      (id) => names.get(id) ?? id,
      (id) => storeNames.get(id) ?? id,
    );
    expect(difference).not.toBe("none");
    expectLoad(file, differing.number, {
      rows,
      source: quotationLabel(differing.q_number, differing.q_revision),
      difference,
    });
  });
});
