/**
 * The stores a paper names, as the FORM carries them (SPEC §3, P14).
 *
 * The founder: "the field takes one warehouse normally and allows a second or a
 * third in the rare case". Three, then — a cap with a reason behind it rather
 * than a round number, and the same three the dialog stops offering at and the
 * action refuses past.
 *
 * FormData has no shape for a list, and a repeated field arrives as a repeat
 * only when at least one box was filled, so the list crosses as one
 * comma-separated value: an empty string is then "he named none" and is
 * refused by the same `required` as before, rather than arriving as `undefined`
 * and being read as "he left the field alone".
 *
 * Pure, and it imports nothing of the database: the dialog is a client
 * component and a value imported from `src/lib/warehouses.ts` would drag the
 * whole `@/db` graph into the browser bundle (rules/data.md).
 *
 * And nothing of zod, for the same reason one step along (P14.5). The field's
 * schema lived here, built at module level, so the dialog's import of ONE
 * integer — `MOST_WAREHOUSES` — could not be tree-shaken away from it: a
 * bundler keeps a module whose top level calls something, and this one called
 * `z.string()`. The whole of zod went to every browser, the largest single
 * chunk in the build, for the number three. The schema is the actions' and it
 * lives beside them now, in `src/lib/warehouses.ts`.
 */

/** One normally, and a second or a third in the rare case. */
export const MOST_WAREHOUSES = 3;

/**
 * The ids in the order they were typed, with the rubbish and the repeats out.
 *
 * Two names for one store is one store, here and in `setWarehouses`, so the
 * same list cannot mean two things on the two sides of the save.
 */
export function warehouseIdsFrom(value: string): number[] {
  return value
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((id) => Number.isSafeInteger(id) && id > 0)
    .filter((id, index, all) => all.indexOf(id) === index);
}

