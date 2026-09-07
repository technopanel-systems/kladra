/**
 * A write pressed twice is one write (P11I, D134).
 *
 * The wire can lose the answer after the row has landed: the rep is told the
 * server could not be reached and nothing was saved (D132), and presses Save
 * again. The second press carries the same words to the same record from the
 * same person seconds later, and three creating actions — the log, the company
 * and the project, the three a rep writes many times a day — answer it with the
 * row that already exists instead of a twin. Requesting a quotation or a
 * dispatch does not: those carry line items, so "the same write" means
 * comparing every line of two papers, and it is a named gap in WORKFLOW §5
 * rather than something half-done here. Two minutes is the window — long
 * enough for the second press after the sentence, short enough that a second
 * visit logged in the same words an hour later is its own entry.
 */
export const TWIN_WINDOW_MS = 2 * 60_000;

/** The moment before which an identical write is a new one, not a twin. */
export function sinceTwinWindow(): Date {
  return new Date(Date.now() - TWIN_WINDOW_MS);
}

/**
 * Whether one field of a candidate twin is the same as the field being written.
 *
 * A twin is an EXACT repeat, not a near one. The rep was just told nothing was
 * saved, so the second press is as likely to carry a correction — the project
 * he had picked wrongly, the follow-up he had forgotten — as the same words
 * again, and a match that ignores what he changed would swallow the correction
 * and tell him it was logged. Anything that differs makes it a new write.
 *
 * A column reads back as null and a form field arrives as undefined; here they
 * are one thing, because "nothing" typed twice is the same nothing.
 */
export function sameField(
  written: string | number | null | undefined,
  stored: string | number | null | undefined,
): boolean {
  return (written ?? null) === (stored ?? null);
}
