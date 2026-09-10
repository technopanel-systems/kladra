/**
 * Which view a list screen is showing, and how it is remembered.
 *
 * Two rules from Jerom's P8 note: the default is the view that answers the
 * daily question, and the choice lives in the URL AND is remembered per person.
 * The URL comes first — a link somebody sends opens what they were looking at —
 * and the memory only decides what happens when there is no `?view=` at all.
 *
 * The memory was a cookie until §3 was read back against it: a cookie is per
 * BROWSER, so the rep who chose the board at his desk got the list back on his
 * phone. It is a row of `screen_choices` now (src/lib/screen-choice.ts), one
 * per screen, so choosing the board for quotations does not silently change
 * what dispatches opens on.
 *
 * Which screens have two views, and why the others do not, is DESIGN §6.
 *
 * Pure: no database, so `tests/board.spec.ts` can ask it directly and the
 * client half can import it.
 */

export type ListView = "list" | "board";

/** The list is the default everywhere: it answers "mine, oldest first". */
export const DEFAULT_VIEW: ListView = "list";

export function parseView(value: unknown): ListView | null {
  return value === "list" || value === "board" ? value : null;
}

/** The URL wins; the memory is consulted only when the URL says nothing. */
export function viewFor(fromUrl: unknown, remembered: unknown): ListView {
  return parseView(fromUrl) ?? parseView(remembered) ?? DEFAULT_VIEW;
}
