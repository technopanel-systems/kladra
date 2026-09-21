/**
 * How a dispatch differs from the quotation it was prefilled from (SPEC §3,
 * P13): "any difference from the quotation is flagged on the dispatch for Rawan
 * and recorded for later analysis. A dispatch carries services as well as
 * panels — the same inputs as the quotation it came from — so the flag compares
 * the whole thing." The shape `dispatches.quotation_difference` holds, and the
 * one function that decides what goes in it.
 *
 * What is a difference, and what is not, is a business rule rather than a diff:
 *
 * - A line or a service the quotation does not have is `added`.
 * - The stores the load leaves from, where they are not the stores the
 *   quotation was priced out of (P14: "the dispatch difference flag compares the
 *   warehouses as it compares the panels and the services"). One entry for the
 *   whole load, because the stores are named on the whole load and never per
 *   line, and compared as a SET: naming Riyadh and Malham where the paper named
 *   Malham and Riyadh is the same load, and a flag on the order somebody typed
 *   two names in is a flag nobody could act on.
 * - A sheet field, a price, a service or its m² changed on a line or a service
 *   that was carried from the quotation is `changed`, with the value it had and
 *   the value it has now.
 * - A carried line sending FEWER sheets than were left is a partial load, and a
 *   quotation line or service left off the load altogether is one too. Neither
 *   is a difference: cladding goes out in stages, and a flag on every partial
 *   load would be a flag on every load (SPEC §4, P13-S3). So the quantity is not
 *   compared at all — more than is left is refused by the action before this is
 *   ever asked, and less is the business.
 *
 * Lines and services are paired by the link the dispatch row carries to the
 * quotation row it was prefilled from, never by position or by colour: the rep
 * cannot move a line to another line, so the link is the truth, and a pairing
 * heuristic would only be a way to be wrong about it (compare
 * `src/lib/quotation-diff.ts`, which has no such link and has to guess).
 *
 * The values are compared as the caller hands them over. The server hands over
 * the words a reader sees — supplier N, rating B1, class A, 4.0 mm, which read
 * the same in both languages — so what is recorded is what Rawan would have seen
 * differ; a service is handed over by its id, because its name is in two
 * languages and the drawer names it in the reader's. Figures are compared as
 * the database holds them, to the halala, so "1.5" and "1.50" are one width.
 *
 * Pure, with one relative import of a module that imports nothing: the schema
 * reads the type from here, and drizzle-kit reads the schema outside Next, where
 * the `@/` alias does not exist.
 */
import { round2, toNumber } from "./money";

/**
 * A panel line, a service, or the load itself.
 *
 * The third is the whole load and has no line number, so the shapes below are
 * three and not one: a reader that handles a line handles a service, and has to
 * be told about the load on purpose.
 */
export type DifferenceKind = Difference["kind"];

/** The inputs of a carried line that can differ, in the order the form asks for them (SPEC §3, S32). */
export const SHEET_FIELDS = [
  "colourCode",
  "supplier",
  "fireRating",
  "class",
  "thickness",
  "width",
  "length",
  "pricePerSqm",
] as const;

export type SheetField = (typeof SHEET_FIELDS)[number];

/** The inputs of a carried service that can differ. */
export const SERVICE_FIELDS = ["service", "sqm", "pricePerSqm"] as const;

export type ServiceField = (typeof SERVICE_FIELDS)[number];

/** What can differ about the load itself rather than about a line on it. */
export type LoadField = "warehouses";

export type DifferenceField = SheetField | ServiceField | LoadField;

/** Figures, compared and recorded to the halala rather than as typed. */
const FIGURES: readonly DifferenceField[] = ["width", "length", "pricePerSqm", "sqm"];

export type Difference =
  | {
      kind: "line" | "service";
      /** The line's or the service's number on the dispatch — a carried one keeps its quotation number. */
      position: number;
      change: "added";
    }
  | {
      kind: "line" | "service";
      position: number;
      change: "changed";
      field: SheetField | ServiceField;
      /**
       * What the quotation said and what the dispatch says. Figures to two
       * decimals with no grouping, Western digits; a line's lookups as their
       * words; a service as its id (see above).
       */
      from: string;
      to: string;
    }
  | {
      /** The load itself, which has no line number (P14). */
      kind: "load";
      change: "changed";
      field: LoadField;
      /**
       * The stores each side names, by id, lowest first and joined by commas
       * — ids for the reason a service is an id, and in one fixed order, so
       * that "the same stores" is one string and not two.
       */
      from: string;
      to: string;
    };

/** A line's sheet as the comparison reads it. */
export type SheetValues = Record<SheetField, string>;

/** A line of the quotation. */
export type QuotedLine = SheetValues & { id: string; position: number };

/** A line of the dispatch, and the quotation line it came from — null when the rep added it. */
export type LoadLine = SheetValues & { quotationItemId: string | null; position: number };

/** A service of the quotation. */
export type QuotedService = Record<ServiceField, string> & { id: string; position: number };

/** A service of the dispatch, and the quotation service it came from — null when the rep added it. */
export type LoadService = Record<ServiceField, string> & {
  quotationServiceId: string | null;
  position: number;
};

/** One field's value as it is compared and recorded. */
function canonical(field: DifferenceField, value: string): string {
  return FIGURES.includes(field) ? round2(toNumber(value)).toFixed(2) : value.trim();
}

function changesBetween<F extends SheetField | ServiceField>(
  kind: "line" | "service",
  position: number,
  fields: readonly F[],
  was: Record<F, string>,
  is: Record<F, string>,
): Difference[] {
  return fields.flatMap((field) => {
    const from = canonical(field, was[field]);
    const to = canonical(field, is[field]);
    return from === to ? [] : [{ kind, position, change: "changed" as const, field, from, to }];
  });
}

/**
 * Everything on this load that is not what the quotation said, lines first and
 * then services, each in the dispatch's own order. An empty list is a load that
 * matches its paper — a real answer, and the one most loads give.
 */
export function differenceFrom(
  quotation: {
    lines: readonly QuotedLine[];
    services: readonly QuotedService[];
    warehouses: readonly number[];
  },
  dispatch: {
    lines: readonly LoadLine[];
    services: readonly LoadService[];
    warehouses: readonly number[];
  },
): Difference[] {
  const quotedLines = new Map(quotation.lines.map((line) => [line.id, line]));
  const quotedServices = new Map(quotation.services.map((service) => [service.id, service]));

  const lines = [...dispatch.lines]
    .sort((a, b) => a.position - b.position)
    .flatMap((line): Difference[] => {
      const was = line.quotationItemId ? quotedLines.get(line.quotationItemId) : undefined;
      if (!was) return [{ kind: "line", position: line.position, change: "added" }];
      return changesBetween("line", line.position, SHEET_FIELDS, was, line);
    });

  const services = [...dispatch.services]
    .sort((a, b) => a.position - b.position)
    .flatMap((service): Difference[] => {
      const was = service.quotationServiceId
        ? quotedServices.get(service.quotationServiceId)
        : undefined;
      if (!was) return [{ kind: "service", position: service.position, change: "added" }];
      return changesBetween("service", service.position, SERVICE_FIELDS, was, service);
    });

  // The load's own fact, after the lines and the services: the drawer reads
  // them in the order this list gives them, and where the panels changed too,
  // the store they came out of is the smaller half of the news.
  const from = storeList(quotation.warehouses);
  const to = storeList(dispatch.warehouses);
  const stores: Difference[] =
    from === to ? [] : [{ kind: "load", change: "changed", field: "warehouses", from, to }];

  return [...lines, ...services, ...stores];
}

/** The stores as one comparable, recordable string: each id once, lowest first. */
function storeList(ids: readonly number[]): string {
  return [...new Set(ids)].sort((a, b) => a - b).join(",");
}

/**
 * A translator, as every other module that names a thing in the reader's
 * language takes one (`paymentTermsLabel`, `lossReasonLabel`).
 *
 * Taking it rather than calling a hook is what lets the one mapping serve the
 * drawer, which renders each part in its own element, and the file, which needs
 * the whole thing as one string.
 */
type Translate = (key: string, values?: Record<string, string | number>) => string;

/**
 * What a field is called, and the unit its figures are recorded in.
 *
 * Both were written twice — a map of English words here for the admin's file,
 * and a pair of switch statements in `dispatch-differences.tsx` for the drawer —
 * until the files began coming in both languages (P14 14.10). Two copies of
 * "what this field is called" is the shape that drifts, and one of them being
 * English-only was the drift.
 *
 * The field's name carries no unit — "Width", not "Width (m)" — because the
 * unit goes on the figure; saying it twice on one line is noise.
 */
export function differenceFieldLabel(field: DifferenceField, t: Translate): string {
  switch (field) {
    case "service":
      return t("quotations.service");
    case "warehouses":
      return t("common.warehouse");
    case "sqm":
      return t("dispatches.field.area");
    case "width":
      return t("dispatches.field.width");
    case "length":
      return t("dispatches.field.length");
    case "pricePerSqm":
      return t("dispatches.field.price");
    default:
      return t(`common.${field}`);
  }
}

/** Metres for a width and a length, millimetres for a thickness, SAR per m² for a price. */
export function differenceUnit(field: DifferenceField, t: Translate): string | null {
  switch (field) {
    case "width":
    case "length":
      return t("dispatches.unit.metres");
    case "thickness":
      return t("common.mm");
    case "pricePerSqm":
      return t("dispatches.unit.sarPerSqm");
    case "sqm":
      return t("common.sqm");
    default:
      return null;
  }
}

/**
 * What differed, in words, one entry to a line, for the dispatches file (SPEC
 * §3 P13: "recorded for later analysis"; P14 14.10: "comes in both languages").
 *
 * The file is read in Excel by somebody asking which loads left the paper and
 * how, so it says it in words and with units rather than as the JSON the column
 * holds. It was English whoever read it, which was defensible while the file was
 * the admin's alone and is not now that the file is a screen exported by
 * whoever is reading that screen.
 *
 * The shape is the drawer's, not a sentence: the thing, then what it is now,
 * then what the paper said as an aside — "Item 1 · Supplier: K (was N)". A
 * sentence with a verb in it would have to agree with the gender of the noun in
 * front of it in Arabic, and «تغيّر» against «الخدمة» is the kind of wrong that
 * reads as machine-written; the three-part shape needs no verb at all. The
 * entries are separated by a newline rather than by a mark, because a semicolon
 * is «؛» in one language and ";" in the other, and because a cell of four
 * changes is read in Excel as four lines.
 *
 * Items and services are numbered as the file's own `item` column numbers them.
 * A load with no paper has nothing to differ from and says nothing (its `source`
 * already says `direct`); a load that matches its paper says «none», which is
 * an answer and not a blank.
 *
 * A service and a store are recorded by id (see above), so the caller hands over
 * the names — in the reader's language, as the drawer hands over its own.
 */
export function differenceInWords(
  difference: readonly Difference[] | null,
  t: Translate,
  serviceName: (id: string) => string,
  warehouseName: (id: string) => string,
): string {
  if (difference === null) return "";
  if (difference.length === 0) return t("dispatches.differenceNone");
  return difference
    .map((entry) => {
      // The load's own change is not a line and wears no number: the field
      // beneath it says "Warehouse", which is the whole of what there is to say.
      const number =
        entry.kind === "load"
          ? null
          : t(entry.kind === "line" ? "quotations.itemNumber" : "quotations.serviceNumber", {
              number: entry.position,
            });
      if (entry.change === "added") {
        return t("dispatches.differenceAdded", { what: number ?? "" });
      }
      // "Service 2: Fabrication" — the field's name would be the word "Service"
      // a second time, so the number stands alone where the field IS the thing.
      const label = entry.field === "service" ? null : differenceFieldLabel(entry.field, t);
      const unit = differenceUnit(entry.field, t);
      const value = (raw: string) => {
        if (entry.field === "service") return serviceName(raw);
        // A list of stores reads as the names, in the order the flag recorded
        // them, with the mark between them the drawer uses (rules/words.md).
        if (entry.field === "warehouses") {
          return raw
            .split(",")
            .filter(Boolean)
            .map(warehouseName)
            .join(" · ");
        }
        return unit ? `${raw} ${unit}` : raw;
      };
      return t("dispatches.differenceChanged", {
        // A mark between them, never a gap: «البند 1 المورّد» is two definite
        // nouns run together and reads as a mistake, and the app's answer to
        // two values on one line is the separator (rules/words.md).
        what: [number, label].filter(Boolean).join(" · "),
        to: value(entry.to),
        from: value(entry.from),
      });
    })
    .join("\n");
}
