/**
 * How many rows a screen asks for (D80).
 *
 * Every list in this app used to render every row it was given, and every row
 * renders twice — a card for the phone and a row for the desk, one of them
 * hidden by CSS at any width. On the seeded floor that is twelve companies and
 * nobody notices; on the founder's it is a thousand, and the first row a rep
 * needs is somewhere inside a megabyte of HTML he will never scroll to.
 *
 * These are not page sizes. There is no next page, because the answer to "there
 * are more" on this app is the search box and the four bands, not a pager
 * nobody presses (DESIGN §4): a list says how many there are and what to type
 * to find the rest. Pure numbers in a file with no imports, so a client
 * component can read one without dragging the database into the browser.
 */

/** A full list screen: companies, projects, quotations, dispatches. */
export const LIST_LIMIT = 200;

/** One band of the day screen — what a rep reads standing up, before lunch. */
export const BAND_LIMIT = 25;

/** One group of the manager's stuck list, of which there are five. */
export const STUCK_SHOWN = 20;

/** A drawer's activity tab: the last conversations, not the whole history. */
export const ACTIVITY_SHOWN = 50;

/**
 * One group of a list: what the screen draws, and how many there are.
 *
 * Two fields because a figure above a list and the rows under it are the same
 * question asked twice — "how many" and "which ones" — and the first must never
 * be answered by counting the second (rules/data.md). Pure, and tested on its
 * own (tests/lists.spec.ts), because the seeded floor is twelve companies and a
 * cap that only bites at two hundred is a rule no walk through a screen can
 * reach.
 */
export type Group<Row> = {
  rows: Row[];
  total: number;
};

/** The top of a list, carrying the length of the whole of it. */
export function topOf<Row>(rows: Row[], shown: number): Group<Row> {
  return { rows: rows.slice(0, shown), total: rows.length };
}
