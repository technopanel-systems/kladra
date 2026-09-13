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

/** A panel line or a service. */
export type DifferenceKind = "line" | "service";

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

export type DifferenceField = SheetField | ServiceField;

/** Figures, compared and recorded to the halala rather than as typed. */
const FIGURES: readonly DifferenceField[] = ["width", "length", "pricePerSqm", "sqm"];

export type Difference =
  | {
      kind: DifferenceKind;
      /** The line's or the service's number on the dispatch — a carried one keeps its quotation number. */
      position: number;
      change: "added";
    }
  | {
      kind: DifferenceKind;
      position: number;
      change: "changed";
      field: DifferenceField;
      /**
       * What the quotation said and what the dispatch says. Figures to two
       * decimals with no grouping, Western digits; a line's lookups as their
       * words; a service as its id (see above).
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

function changesBetween<F extends DifferenceField>(
  kind: DifferenceKind,
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
  quotation: { lines: readonly QuotedLine[]; services: readonly QuotedService[] },
  dispatch: { lines: readonly LoadLine[]; services: readonly LoadService[] },
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

  return [...lines, ...services];
}
