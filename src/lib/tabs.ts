/**
 * Which tab of a home screen is showing, and how it is remembered (D151).
 *
 * The three home screens were one long column each, and the founder's complaint
 * about the six-month chart is what a long column does: it put something he
 * cannot act on above the work he opens the screen for. One question sorts
 * them. **Work** is what a person can do something about before he goes home.
 * **Metrics** is what is measured over a window rather than acted on. **Team**
 * is people rather than work, and only the manager is asked about people.
 *
 * Deliberately the same shape as `src/lib/view.ts`, down to the cookie name and
 * the order of precedence, because it is the same rule: the URL wins so a link
 * opens on what the sender was looking at, and the memory decides only when the
 * URL says nothing. A second mechanism for one idea is the drift this file
 * exists to avoid.
 *
 * Pure: no database, no cookies API, so `tests/tabs.spec.ts` asks it directly
 * and a client component can import it.
 */

export const TABS = ["work", "metrics", "team"] as const;

export type Tab = (typeof TABS)[number];

/** Work first, everywhere: it is what the screen is opened for. */
export const DEFAULT_TAB: Tab = "work";

export function parseTab(value: unknown, allowed: readonly Tab[]): Tab | null {
  return allowed.includes(value as Tab) ? (value as Tab) : null;
}

/**
 * One cookie per screen, so the manager reading his metrics does not change
 * what a rep's day opens on. Per browser rather than per person, for the reason
 * `viewCookie` gives: one person signs into one browser here, and a preference
 * is not worth a migration.
 */
export function tabCookie(screen: string): string {
  return `kladra-tab-${screen}`;
}

/**
 * The URL wins; the cookie is consulted only when the URL says nothing; and a
 * tab this screen does not have falls back rather than rendering nothing.
 *
 * That last clause is not defensive padding. A manager who was last on his team
 * tab and follows a link to a rep's day would otherwise land on a tab that
 * screen has never had, and the cookie is shared by name across a browser.
 */
export function tabFor(fromUrl: unknown, fromCookie: unknown, allowed: readonly Tab[]): Tab {
  return parseTab(fromUrl, allowed) ?? parseTab(fromCookie, allowed) ?? allowed[0] ?? DEFAULT_TAB;
}
