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
 * Deliberately the same shape as `src/lib/view.ts`, down to the order of
 * precedence and the table the memory lives in, because it is the same rule:
 * the URL wins so a link opens on what the sender was looking at, and the
 * memory decides only when the URL says nothing. A second mechanism for one
 * idea is the drift this file exists to avoid — which is why, when §3 moved the
 * view's memory off cookies and onto the person, this moved with it.
 *
 * Pure: no database, so `tests/ranges.spec.ts` asks it directly — the two
 * choices a home screen carries in its URL are tested in one file — and a
 * client component can import it.
 */

export const TABS = ["work", "metrics", "team"] as const;

export type Tab = (typeof TABS)[number];

/** Work first, everywhere: it is what the screen is opened for. */
export const DEFAULT_TAB: Tab = "work";

export function parseTab(value: unknown, allowed: readonly Tab[]): Tab | null {
  return allowed.includes(value as Tab) ? (value as Tab) : null;
}

/**
 * The URL wins; the memory is consulted only when the URL says nothing; and a
 * tab this screen does not have falls back rather than rendering nothing.
 *
 * That last clause is not defensive padding. The day and the team remember
 * separately, but a screen can LOSE a tab between one visit and the next —
 * marketing carries no metrics, and a coordinator's day is not a manager's — so
 * a remembered word that this screen has no tab for is an ordinary Tuesday, not
 * a tampered URL.
 */
export function tabFor(fromUrl: unknown, remembered: unknown, allowed: readonly Tab[]): Tab {
  return parseTab(fromUrl, allowed) ?? parseTab(remembered, allowed) ?? allowed[0] ?? DEFAULT_TAB;
}
