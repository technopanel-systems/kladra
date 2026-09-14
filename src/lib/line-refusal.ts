/**
 * A refused line, named at the line (DESIGN §5: one rejected input, one
 * sentence, at the input; D43).
 *
 * A quotation's lines and a load's arrive as one JSON field — FormData has no
 * shape for a list the rep grows — so a blank price on the eighth of twelve lines
 * came back as one sentence in the footer with nothing on the screen marked, and
 * the rep read twelve rows to find it. The action now names the first box that
 * is wrong as `items.7.pricePerSqm` (or `services.0.sqm`), under the list's own
 * field name, and the line component marks that box `aria-invalid`, which is
 * what `useFocusFirstError` takes the caret to.
 *
 * Pure and import-free: the actions build the key and the forms read it back,
 * and one file is what keeps the two spellings from drifting.
 */

/** The two lists a paper carries, by the field name the forms post them under. */
export type LineList = "items" | "services";

/** Where a refusal points: the row's index in the list as posted, and the input's own name. */
export type LineRefusal = { index: number; field: string; message: string };

/** `items.7.pricePerSqm` — the key an action puts in `fieldErrors`. */
export function lineFieldKey(list: LineList, index: number, field: string): string {
  return `${list}.${index}.${field}`;
}

/**
 * The first box a schema over the whole list refused, as that key — or null when
 * the list itself was wrong (none at all, too many, one quotation line twice),
 * which no single box can be marked for.
 */
export function firstRefusedBox(
  list: LineList,
  issues: readonly { path: readonly PropertyKey[] }[],
): string | null {
  for (const issue of issues) {
    const [index, field] = issue.path;
    if (typeof index === "number" && typeof field === "string") {
      return lineFieldKey(list, index, field);
    }
  }
  return null;
}

/** The refusal a form draws on its lines, read back out of the action's `fieldErrors`. */
export function lineRefusal(
  list: LineList,
  fieldErrors: Readonly<Record<string, string>>,
): LineRefusal | null {
  for (const [key, message] of Object.entries(fieldErrors)) {
    const match = /^(items|services)\.(\d+)\.([A-Za-z]+)$/.exec(key);
    if (match && match[1] === list) return { index: Number(match[2]), field: match[3], message };
  }
  return null;
}
