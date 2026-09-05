/**
 * What changed between one revision of a quotation and the one before it
 * (SPEC D76, 9A item 10).
 *
 * The coordinator prices Q-12, issues it, and a week later Q-12/2 arrives
 * carrying the same three lines. Nothing on it says which of the nine fields on
 * which of the three lines is different, so she either re-prices all of it or
 * opens the old one in another tab and compares by eye — the five-day walk put
 * it in six words: she re-issues blind.
 *
 * Pure, and structural: it takes two lists of lines and knows nothing about the
 * database or the screen. That is what lets `tests/revision.spec.ts` ask it the
 * awkward questions — a line removed from the middle, a colour quoted twice, a
 * revision that changed nothing — none of which the demo dataset happens to
 * contain, and all of which a rep will do in the first week.
 *
 * The pairing is the whole difficulty. A revision opens on the parent's lines in
 * order, so position is nearly always right; but a rep who deletes the second of
 * four lines would then be told that lines 2 and 3 changed everything and line 4
 * was removed, which is three lies for one deletion. So lines are paired in
 * three passes, strongest first: identical lines pair off, then lines with the
 * same colour code, then whatever is left, in order. What remains on one side
 * only was added or removed.
 */

/** The fields a line has, in the order the form asks for them (SPEC §3, S32). */
export const LINE_FIELDS = [
  "colourCode",
  "supplier",
  "fireRating",
  "class",
  "qty",
  "thickness",
  "width",
  "length",
  "pricePerSqm",
] as const;

/**
 * Derived from the list, never written beside it (D64): a tenth field is a
 * compile error here and a missing word in `npm run check:messages`, rather
 * than a change that silently never shows up.
 */
export type LineField = (typeof LINE_FIELDS)[number];

/**
 * A line as this comparison sees it: the words the screen shows, not the ids
 * behind them. Two lines differ when a reader would see them differ.
 */
export type ComparableLine = Record<LineField, string> & { position: number };

/** One field that is not what it was. */
export type FieldChange = { field: LineField; from: string; to: string };

/**
 * One line's news.
 *
 * `changed` carries at least one field; `added` and `removed` carry none,
 * because the whole line is the news. Every one of them carries the colour code
 * as well as the number: a REMOVED line's number belongs to the quotation the
 * reader is not looking at, and its colour is the only name it has on this one.
 */
export type LineChange = {
  kind: "added" | "removed" | "changed";
  /** The line's number in whichever quotation it is still in. */
  position: number;
  colourCode: string;
  fields: FieldChange[];
};

function sameLine(a: ComparableLine, b: ComparableLine): boolean {
  return LINE_FIELDS.every((field) => a[field] === b[field]);
}

function fieldsBetween(before: ComparableLine, after: ComparableLine): FieldChange[] {
  return LINE_FIELDS.filter((field) => before[field] !== after[field]).map((field) => ({
    field,
    from: before[field],
    to: after[field],
  }));
}

/**
 * Pair the old lines with the new ones, strongest match first.
 *
 * Returns the pairs plus whatever had no partner on either side. Every line is
 * used at most once, so a colour quoted twice cannot pair with itself twice.
 */
function pairUp(
  before: readonly ComparableLine[],
  after: readonly ComparableLine[],
): { pairs: [ComparableLine, ComparableLine][]; removed: ComparableLine[]; added: ComparableLine[] } {
  const oldOnes = [...before];
  const newOnes = [...after];
  const pairs: [ComparableLine, ComparableLine][] = [];

  const take = (match: (a: ComparableLine, b: ComparableLine) => boolean) => {
    for (let i = oldOnes.length - 1; i >= 0; i -= 1) {
      const j = newOnes.findIndex((candidate) => match(oldOnes[i], candidate));
      if (j === -1) continue;
      pairs.push([oldOnes[i], newOnes[j]]);
      oldOnes.splice(i, 1);
      newOnes.splice(j, 1);
    }
  };

  take(sameLine);
  take((a, b) => a.colourCode === b.colourCode);
  // Whatever is left pairs in order: the rep changed the colour of a line as
  // well as its price, and the position is the only thing still tying them.
  while (oldOnes.length > 0 && newOnes.length > 0) {
    pairs.push([oldOnes.shift()!, newOnes.shift()!]);
  }

  return { pairs, removed: oldOnes, added: newOnes };
}

/**
 * What changed, one entry per line that is not as it was, in the new
 * quotation's own order. An empty list means the lines are identical — which is
 * a real answer and worth saying out loud, because it means the revision is
 * about something else.
 */
export function compareLines(
  before: readonly ComparableLine[],
  after: readonly ComparableLine[],
): LineChange[] {
  const { pairs, removed, added } = pairUp(before, after);

  const changes: LineChange[] = [];
  for (const [was, is] of pairs) {
    const fields = fieldsBetween(was, is);
    if (fields.length > 0) {
      changes.push({ kind: "changed", position: is.position, colourCode: is.colourCode, fields });
    }
  }
  for (const line of added) {
    changes.push({ kind: "added", position: line.position, colourCode: line.colourCode, fields: [] });
  }
  changes.sort((a, b) => a.position - b.position);

  // The ones that are gone go last, in their own old order: they are the only
  // entries a reader cannot find by looking down the lines in front of them.
  for (const line of [...removed].sort((a, b) => a.position - b.position)) {
    changes.push({
      kind: "removed",
      position: line.position,
      colourCode: line.colourCode,
      fields: [],
    });
  }

  return changes;
}
