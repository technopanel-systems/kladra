import { csv, csvCell } from "@/lib/csv";
import { EXPORT_COLUMNS } from "@/lib/export/columns";
import { differenceInWords, type Difference } from "@/lib/dispatch-difference";
import { dispatchLabel, quotationLabel } from "@/lib/labels";
import { lineTotal, serviceTotal } from "@/lib/money";
import { login } from "./helpers/auth";
import { one, query } from "./helpers/db";
import { keyed, readCsv } from "./helpers/file";
import { test, expect, type Translate } from "./helpers/i18n";

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
  // A figure below nought is a figure.
  expect(csvCell("-1500.50")).toBe('"-1500.50"');
  expect(csvCell(-3)).toBe('"-3"');
});

/**
 * A phone is text, in every file it appears in (D96, and the addendum's "stored
 * E.164"). It was let through as a signed number, and Excel read +966501234567
 * as 9.66501E+11 — the digits past the twelfth gone and the plus with them, on
 * the one column somebody would pick up and dial.
 */
test("a phone keeps every digit and its plus", () => {
  expect(csvCell("+966501234567")).toBe("\"'+966501234567\"");
  expect(csvCell("+971501234567")).toBe("\"'+971501234567\"");
  // And in a file, where the column is not declared numeric because a phone is
  // not a figure (src/lib/export/contacts.ts).
  const file = csv(
    [
      { key: "contact", label: "Contact" },
      { key: "phone", label: "Phone" },
    ],
    [{ contact: "Saud Al-Mutairi", phone: "+966551204477" }],
  );
  expect(file).toContain("\"Saud Al-Mutairi\",\"'+966551204477\"");
});

test("a quote is doubled, a comma and a newline stay inside the cell, nothing is nothing", () => {
  expect(csvCell('Al-Rajhi "Tower"')).toBe('"Al-Rajhi ""Tower"""');
  expect(csvCell("Riyadh, Olaya")).toBe('"Riyadh, Olaya"');
  expect(csvCell("two\nlines")).toBe('"two\nlines"');
  expect(csvCell(null)).toBe('""');
  expect(csvCell(undefined)).toBe('""');
});

/**
 * The file itself (SPEC §3, P14 14.10). The founder: it "opens in Excel with
 * its numbers as numbers". A column declared numeric is written bare — and only
 * where the cell IS a figure, so an empty price and a dash still cannot arm a
 * spreadsheet. The head carries words, not keys, because the file comes in the
 * reader's language.
 */
test("a column of figures is written bare, a name is quoted, and the head is words", () => {
  const file = csv(
    [
      { key: "company", label: "الشركة" },
      { key: "sqm", label: "م²", numeric: true },
      { key: "price_per_sqm", label: "Price per m²", numeric: true },
    ],
    [
      { company: "Al-Rajhi, Tower", sqm: "215.76", price_per_sqm: 127 },
      { company: "=SUM(A1)", sqm: null, price_per_sqm: "—" },
    ],
  );
  expect(file).toBe(
    "\ufeff" +
      [
        '"الشركة","م²","Price per m²"',
        '"Al-Rajhi, Tower",215.76,127',
        '"\'=SUM(A1)","","—"',
      ].join("\r\n") +
      "\r\n",
  );
});

/**
 * One word per thing, at the top of a column too (SPEC §5).
 *
 * Every file shares one vocabulary (src/lib/export/columns.ts), so two columns
 * that carried the same word would be two columns a reader cannot tell apart —
 * and the specs below, which read a file back by its headings, could not tell
 * them apart either.
 */
test("no two columns carry the same word", ({ t }) => {
  const seen = new Map<string, string>();
  const clashes: string[] = [];
  for (const column of EXPORT_COLUMNS) {
    const word = t(`export.${column}`);
    const first = seen.get(word);
    if (first) clashes.push(`${first} and ${column} are both "${word}"`);
    else seen.set(word, column);
  }
  expect(clashes, "two columns with one word").toEqual([]);
});

/**
 * What differed, in the words the file prints (SPEC §3 P13: "recorded for later
 * analysis"; P14 14.10: in both languages). Pure: every kind of entry once, with
 * its unit, and the two answers that are not a list — a load with no paper and a
 * load that matches its paper.
 *
 * The expected lines are composed from the same words the drawer says it with,
 * because that is the claim: which field name, which unit, which number and
 * which name is picked for each kind of entry. The English shape is pinned
 * literally underneath, so the composition cannot quietly become nonsense.
 */
test("a difference is written out in words with its units; a matching load says none, a direct one nothing", ({
  locale,
  t,
}) => {
  const names: Record<string, string> = { "3": "CNC cutting", "4": "Fabrication" };
  const serviceName = (id: string) => names[id] ?? id;
  const stores: Record<string, string> = { "3": "Riyadh", "7": "Malham" };
  const storeName = (id: string) => stores[id] ?? id;

  const item = (number: number) => t("quotations.itemNumber", { number });
  const service = (number: number) => t("quotations.serviceNumber", { number });
  const added = (what: string) => t("dispatches.differenceAdded", { what });
  const changed = (what: string, to: string, from: string) =>
    t("dispatches.differenceChanged", { what, to, from });

  expect(differenceInWords(null, t, serviceName, storeName)).toBe("");
  expect(differenceInWords([], t, serviceName, storeName)).toBe(t("dispatches.differenceNone"));

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
  const mm = t("common.mm");
  const metres = t("dispatches.unit.metres");
  const perSqm = t("dispatches.unit.sarPerSqm");
  const sqm = t("common.sqm");

  const written = differenceInWords(difference, t, serviceName, storeName);
  expect(written).toBe(
    [
      changed(`${item(1)} · ${t("common.supplier")}`, "K", "N"),
      changed(`${item(1)} · ${t("common.thickness")}`, `3.0 ${mm}`, `4.0 ${mm}`),
      changed(`${item(1)} · ${t("dispatches.field.width")}`, `1.50 ${metres}`, `1.24 ${metres}`),
      changed(
        `${item(2)} · ${t("dispatches.field.price")}`,
        `127.00 ${perSqm}`,
        `120.00 ${perSqm}`,
      ),
      added(item(5)),
      // The field IS the thing here, so the number stands alone.
      changed(service(1), "Fabrication", "CNC cutting"),
      changed(`${service(1)} · ${t("dispatches.field.area")}`, `45.00 ${sqm}`, `60.00 ${sqm}`),
      added(service(3)),
      // And the load's own change wears no number at all.
      changed(t("common.warehouse"), "Riyadh · Malham", "Riyadh"),
    ].join("\n"),
  );

  // One line per entry, whichever language it is read in.
  expect(written.split("\n")).toHaveLength(9);

  if (locale === "en") {
    // Without the isolates the loader puts around every value (src/i18n/isolate.ts).
    // They are invisible, they belong in the cell — an Arabic sentence with
    // "1.50 m" in it needs them — and they are not what this line is about.
    expect(written.replace(/[\u2068\u2069]/g, "").split("\n")).toEqual([
      "Item 1 · Supplier: K (was N)",
      "Item 1 · Thickness: 3.0 mm (was 4.0 mm)",
      "Item 1 · Width: 1.50 m (was 1.24 m)",
      "Item 2 · Price: 127.00 SAR per m² (was 120.00 SAR per m²)",
      "Item 5 added, not on the quotation",
      "Service 1: Fabrication (was CNC cutting)",
      "Service 1 · Area: 45.00 m² (was 60.00 m²)",
      "Service 3 added, not on the quotation",
      "Warehouse: Riyadh · Malham (was Riyadh)",
    ]);
  }
});

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

/**
 * A load's lines then its services, as the database holds them — the spec's own
 * read, not the export's. The service is named in the language this project
 * reads in, because the file names it in the reader's (P14 14.10).
 */
async function loadRows(dispatchId: string, locale: string): Promise<LoadRow[]> {
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
     select 'service', ds.position, ${locale === "ar" ? "sv.name_ar" : "sv.name_en"}, null, null, null, null, null, null, null, null, null,
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
  t: Translate,
) {
  const label = dispatchLabel(number);
  // Which kind of row it is is a word in the reader's language, like every
  // other cell on the row (P14 14.10), so the database's own `panel` and
  // `service` are turned into words before they are compared.
  const word = (kind: LoadRow["line"]) =>
    t(kind === "panel" ? "quotations.panel" : "quotations.service");
  const rows = file.filter((row) => row.dispatch === label);
  expect(
    rows.map((row) => [row.line, Number(row.item)]),
    `${label}: one row per line and one per service, panels first`,
  ).toEqual(expected.rows.map((row) => [word(row.line), row.item]));

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
  t,
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
  // In the language this project reads in: the difference names a service and a
  // store, and the sentence around them is the reader's (P14 14.10).
  const named = locale === "ar" ? "name_ar" : "name_en";
  const names = new Map(
    (
      await query<{ id: string; name: string }>(
        `select id::text as id, ${named} as name from services`,
      )
    ).map((row) => [row.id, row.name]),
  );
  const storeNames = new Map(
    (
      await query<{ id: string; name: string }>(
        `select id::text as id, ${named} as name from warehouses`,
      )
    ).map((row) => [row.id, row.name]),
  );

  await login(page, locale, "jerom");
  // In the language this project reads in: the file comes in both (P14 14.10),
  // and a screen asks for its own.
  const response = await page.request.get(`/api/export/dispatches?locale=${locale}`);
  expect(response.status()).toBe(200);
  const file = keyed(readCsv((await response.body()).toString("utf8")).rows, t);

  await test.step("a direct load names its source and carries its own prices", async () => {
    const rows = await loadRows(direct.id, locale);
    expect(rows.length).toBeGreaterThan(0);
    expectLoad(file, direct.number, { rows, source: t("dispatches.direct"), difference: "" }, t);
  });

  await test.step("a load that differs says how, in words, once", async () => {
    const rows = await loadRows(differing.id, locale);
    const difference = differenceInWords(
      differing.difference,
      t,
      (id) => names.get(id) ?? id,
      (id) => storeNames.get(id) ?? id,
    );
    expect(difference).not.toBe(t("dispatches.differenceNone"));
    expectLoad(
      file,
      differing.number,
      {
        rows,
        source: quotationLabel(differing.q_number, differing.q_revision),
        difference,
      },
      t,
    );
  });
});
