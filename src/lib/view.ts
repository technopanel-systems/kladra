/**
 * Which view a list screen is showing, and how it is remembered.
 *
 * Two rules from Jerom's P8 note: the default is the view that answers the
 * daily question, and the choice lives in the URL AND is remembered. The URL
 * comes first — a link somebody sends opens what they were looking at — and the
 * memory only decides what happens when there is no `?view=` at all.
 *
 * Which screens have two views, and why the others do not, is DESIGN §6.
 *
 * Pure: no database, no cookies API, so `tests/view.spec.ts` can ask it
 * directly and the client half can import it.
 */

export type ListView = "list" | "board";

/** The list is the default everywhere: it answers "mine, oldest first". */
export const DEFAULT_VIEW: ListView = "list";

export function parseView(value: unknown): ListView | null {
  return value === "list" || value === "board" ? value : null;
}

/**
 * One cookie per screen, so choosing the board for quotations does not silently
 * change what dispatches opens on. Per browser rather than per row in a table:
 * one person signs into one browser here, and a preference is not worth a
 * migration.
 */
export function viewCookie(screen: string): string {
  return `kladra-view-${screen}`;
}

/** The URL wins; the cookie is only consulted when the URL says nothing. */
export function viewFor(fromUrl: unknown, fromCookie: unknown): ListView {
  return parseView(fromUrl) ?? parseView(fromCookie) ?? DEFAULT_VIEW;
}
