/**
 * What a quotation is called before SMAC has given it a number.
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
