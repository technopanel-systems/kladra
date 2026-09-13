/**
 * How a dispatch differed from the quotation it was prefilled from (SPEC §3,
 * P13): "any difference is flagged on the dispatch for Rawan and recorded for
 * later analysis". The shape of what `dispatches.quotation_difference` holds.
 *
 * Imports nothing, because the schema reads it and drizzle-kit reads the schema
 * outside Next, where the `@/` alias does not exist.
 */

/** A panel line or a service, by the position it has on the dispatch or had on the quotation. */
export type DifferenceKind = "line" | "service";

/** The inputs a rep can change on a prefilled line or service. */
export type DifferenceField =
  | "colourCode"
  | "supplier"
  | "fireRating"
  | "class"
  | "qty"
  | "thickness"
  | "width"
  | "length"
  | "pricePerSqm"
  | "service"
  | "sqm";

export type Difference =
  | { kind: DifferenceKind; position: number; change: "added" | "removed" }
  | {
      kind: DifferenceKind;
      position: number;
      change: "changed";
      field: DifferenceField;
      /** Both as the screen writes them, in Western digits (rules/words.md). */
      from: string;
      to: string;
    };
