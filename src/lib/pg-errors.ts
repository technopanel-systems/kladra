/**
 * The unique index a write ran into, or null.
 *
 * Drizzle 0.45 wraps the driver's error: what is thrown is a plain Error whose
 * `cause` carries Postgres's `code` and `constraint`. Measured, not read off a
 * changelog — a probe insert of a duplicate country code. A check that reads
 * `error.code` off the top sees undefined, and the named answer it was written
 * to give ("that phone is already on this company") comes out as "something
 * went wrong" instead. That was the state of the contact form until the SMAC
 * number needed the same answer and the probe was run (D88).
 *
 * Walks `cause` a few levels rather than exactly one, so the next wrapper does
 * not put the form back where it was.
 */
export function violatedUnique(error: unknown): string | null {
  let e = error as { code?: unknown; constraint?: unknown; cause?: unknown } | null | undefined;
  for (let depth = 0; e && depth < 4; depth += 1) {
    if (e.code === "23505") return typeof e.constraint === "string" ? e.constraint : null;
    e = e.cause as typeof e;
  }
  return null;
}
