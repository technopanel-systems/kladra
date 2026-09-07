/**
 * What a quotation and a dispatch are called before SMAC has given either one a
 * number.
 *
 * A request has no SMAC number until the coordinator issues it (SPEC S28), and
 * two people still have to be able to name the same one out loud. `Q-12` is
 * that name; a revision is `Q-12/2`, matching the unique key the database keeps
 * on (number, revision) and SMAC's own habit of writing RE before a revised
 * number (S34).
 *
 * Client-safe on purpose: the list, the drawer and the toast all say it, and a
 * second way of writing it is how one screen ends up disagreeing with another.
 * Western digits in both languages (D6), and the whole thing is a run with no
 * letters in it, so it carries `dir="ltr"` wherever it is rendered — that is
 * exactly the case the direction rule keeps for itself (DESIGN §5).
 */
export function quotationLabel(number: number, revision: number): string {
  return revision > 1 ? `Q-${number}/${revision}` : `Q-${number}`;
}

/**
 * The same idea for a dispatch, which has no revisions: one quotation produces
 * several partial dispatches and each is its own request, so D-3 is a whole
 * name (SPEC S37, D12).
 */
export function dispatchLabel(number: number): string {
  return `D-${number}`;
}

/**
 * The number a person typed when looking for Q-12 or D-3, with or without the
 * prefix — or null when what they typed has no number in it, or one Postgres
 * cannot hold in an int. The list queries bind this as an integer only when it
 * is one. It was `'' <> '' and number = ''::int` in SQL, which does not
 * short-circuit: the cast failed before the guard was read, and a company name
 * typed into the quotations search took the whole screen down (P11G).
 */
export function numberInTerm(term: string): number | null {
  // The FIRST run of digits: "Q-12/3" is quotation 12, revision 3 — stripping
  // every non-digit would have asked for number 123. Screens write Western
  // digits (D6), but a phone's Arabic keyboard types ٤٥, and a search that
  // quietly never finds Q-45 for it is the same defect in a quieter voice.
  const digits = /\d+/.exec(westernDigits(term))?.[0];
  if (!digits) return null;
  const n = Number(digits);
  return Number.isSafeInteger(n) && n <= 2_147_483_647 ? n : null;
}

/** Arabic-Indic (٠–٩) and Extended Arabic-Indic (۰–۹) digits as 0–9. */
const EASTERN_DIGITS = /[٠-٩۰-۹]/g;
function westernDigits(text: string): string {
  // Both ranges end in the digit's own value: U+0660 & 0xF is 0, U+06F9 & 0xF is 9.
  return text.replace(EASTERN_DIGITS, (d) => String(d.charCodeAt(0) & 0xf));
}
