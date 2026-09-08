/**
 * Why a project was lost: the nine codes, and the one line that turns a stored
 * value into words.
 *
 * `projects.lost_reason` is a single text column holding EITHER a code from
 * this list OR, for "Other", the rep's own written line (SPEC §3). So reading
 * it back is never `{stored}`: a code has to be translated and anything else is
 * the writer's own sentence, shown verbatim.
 *
 * Which is what the company drawer did not do (P11J). It printed the column, so
 * a rep who opened a customer with a lost project read "competitor" — an
 * internal code on a screen, the one thing CLAUDE.md says never appears. The
 * projects table had the rule right and kept it to itself, in a client hook.
 *
 * The list lives here rather than in the dialog that writes it because both a
 * server component and a client one read it, and `check-messages` reads this
 * union to demand a word for every member in both locales (rules/words.md):
 * the list is the source, and the union is derived from it.
 */

/** FACET's nine, in the order a rep meets them. `other` stays last (SPEC §3). */
export const LOSS_REASON_CODES = [
  "price",
  "competitor",
  "colour",
  "stock",
  "leadTime",
  "specification",
  "cancelled",
  "quiet",
  "other",
] as const;

export type LossReasonCode = (typeof LOSS_REASON_CODES)[number];

export function isLossReasonCode(value: string): value is LossReasonCode {
  return (LOSS_REASON_CODES as readonly string[]).includes(value);
}

/**
 * The stored reason in the reader's language, or null when there is none.
 *
 * Takes the translator rather than calling a hook, so the one rule serves the
 * server drawer and the client table alike.
 */
export function lossReasonLabel(
  stored: string | null | undefined,
  t: (key: string) => string,
): string | null {
  if (!stored) return null;
  return isLossReasonCode(stored) ? t(`projects.lossReason.${stored}`) : stored;
}
