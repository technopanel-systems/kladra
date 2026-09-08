/**
 * Everything that can happen to a dispatch, named once (D143) — the mirror of
 * `@/lib/quotation-events`, and for the same reason.
 *
 * These are the `audit_log.action` values for the dispatch chain. Every one of
 * them was already being written, in the same transaction as the change it
 * records, with who and when — and nothing read them back, so a dispatch was
 * the one record in this app that could not say what had happened to it. The
 * quotation beside it has had that trail since P9.
 *
 * The list is the source: the actions build their audit string from it, the
 * trail types itself from it, and the words check reads it to demand a sentence
 * in both languages for every member (rules/words.md).
 *
 * Pure, with no query in it, so a component may import it.
 */
export const DISPATCH_EVENTS = [
  "request",
  "update",
  "approve",
  "correctNumber",
  "refuse",
] as const;

export type DispatchEventName = (typeof DISPATCH_EVENTS)[number];

/**
 * Is this one of them? The trail reads `audit_log.action`, a text column any
 * future writer may put anything in, and prints a word per event — so an action
 * with no word for it must not reach the screen at all rather than arrive there
 * as a raw `MISSING_MESSAGE`.
 */
export function isDispatchEvent(what: string): what is DispatchEventName {
  return (DISPATCH_EVENTS as readonly string[]).includes(what);
}

/** The audit action for one of them: `dispatch.approve`. */
export function dispatchEvent(name: DispatchEventName): string {
  return `dispatch.${name}`;
}
