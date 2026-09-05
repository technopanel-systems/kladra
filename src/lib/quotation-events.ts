/**
 * Everything that can happen to a quotation, named once (SPEC D72).
 *
 * These are the `audit_log.action` values for the quotation chain, and the
 * audit log is the history: the drawer's trail reads them back and prints a
 * word for each. So the list is the source — the actions build their audit
 * string from it, the trail types itself from it, and the words check reads it
 * to demand a sentence in both languages for every member (rules/words.md).
 *
 * Pure, with no query in it, so a component may import it.
 */
export const QUOTATION_EVENTS = [
  "request",
  "update",
  "issue",
  "sendBack",
  "revise",
  "cancel",
  "accepted",
  "rejected",
] as const;

export type QuotationEventName = (typeof QUOTATION_EVENTS)[number];

/**
 * Is this one of them? The trail reads `audit_log.action`, which is a text
 * column any future writer may put anything in, and prints a word per event —
 * so an action with no word for it must not reach the screen at all rather than
 * arrive there as a raw `MISSING_MESSAGE`.
 */
export function isQuotationEvent(what: string): what is QuotationEventName {
  return (QUOTATION_EVENTS as readonly string[]).includes(what);
}

/** The audit action for one of them: `quotation.sendBack`. */
export function quotationEvent(name: QuotationEventName): string {
  return `quotation.${name}`;
}
