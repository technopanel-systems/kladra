/**
 * At most six slices: the five largest and the rest (DESIGN §1b, SPEC §3 P13).
 *
 * A pie is for a share of a whole, and past six angles it is a legend and a
 * guessing game — D150's argument, which the founder's reversal kept. So a
 * whole with more parts than that is drawn as its five largest and one slice for
 * everything else, and that slice is a door like the others: to the list of all
 * the parts it folds (the caller knows how to say "these ids").
 *
 * Pure, so a spec asks it with seven parts and nine without a browser.
 */
export const PIE_SLICES = 6;

export type Folded<T> = {
  /** The parts drawn as themselves, largest first. */
  kept: T[];
  /** The parts inside the last slice, largest first; empty when nothing folds. */
  rest: T[];
};

export function foldForPie<T>(parts: readonly T[], valueOf: (part: T) => number): Folded<T> {
  const ranked = [...parts].sort((a, b) => valueOf(b) - valueOf(a));
  if (ranked.length <= PIE_SLICES) return { kept: ranked, rest: [] };
  return { kept: ranked.slice(0, PIE_SLICES - 1), rest: ranked.slice(PIE_SLICES - 1) };
}

/**
 * Whole per-cents that add up to 100 — the largest remainders take the leftover
 * points — so six slices never read 99% or 101% between them. The share is of
 * the whole passed in, which is the whole the card's caption names.
 */
export function wholePercents(values: readonly number[]): number[] {
  const total = values.reduce((sum, v) => sum + v, 0);
  if (total <= 0) return values.map(() => 0);
  const exact = values.map((v) => (v / total) * 100);
  const floors = exact.map(Math.floor);
  let left = 100 - floors.reduce((sum, v) => sum + v, 0);
  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (left <= 0) break;
    if (values[i] > 0) {
      floors[i] += 1;
      left -= 1;
    }
  }
  return floors;
}
