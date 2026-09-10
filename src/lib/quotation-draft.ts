/**
 * A quotation line as a form holds it: nine strings and nothing else.
 *
 * The dialog that types a quotation and the queries that hand it something to
 * start from have to agree on this shape, and it is pure — no query, no
 * `@/db` — so the client component may import it without dragging the server
 * graph into the browser bundle (rules/data.md, `src/lib/picker-option.ts`).
 *
 * Everything is a string because everything came out of an input, and turning
 * a number into a number twice — once hopefully here, once properly in the
 * action — is how a comma becomes a NaN nobody notices.
 */
export type DraftLine = {
  colourCode: string;
  supplierId: string;
  fireRatingId: string;
  classId: string;
  thicknessId: string;
  qty: string;
  width: string;
  length: string;
  pricePerSqm: string;
};

/**
 * What a stored line carries: the four lookups by their own id, never by the
 * words on the screen, so renaming a class in Lookups cannot move a line onto a
 * different one.
 */
export type StoredLine = {
  colourCode: string;
  supplierId: number;
  fireRatingId: number;
  classId: number;
  thicknessId: number;
  qty: number;
  width: string;
  length: string;
  pricePerSqm: string;
};

/**
 * Stored lines, as a form would open on them.
 *
 * Three screens want this and each had its own copy of the nine field names —
 * Edit, Revise, and now "copy the lines from the last one". One mapping, so a
 * tenth field is added in one place (D64).
 */
export function draftLinesFrom(items: readonly StoredLine[]): DraftLine[] {
  return items.map((item) => ({
    colourCode: item.colourCode,
    supplierId: String(item.supplierId),
    fireRatingId: String(item.fireRatingId),
    classId: String(item.classId),
    thicknessId: String(item.thicknessId),
    qty: String(item.qty),
    width: item.width,
    length: item.length,
    pricePerSqm: item.pricePerSqm,
  }));
}
