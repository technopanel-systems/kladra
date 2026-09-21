/**
 * What a failed write may say in the log.
 *
 * drizzle-orm wraps every query failure in a `DrizzleQueryError` whose MESSAGE
 * is literally `Failed query: <sql>\nparams: <the bound values>`, so
 * `console.error("… failed", error)` writes customer names, telephone numbers,
 * prices and quotation numbers into `docker logs` on any constraint violation
 * or connection blip (P14.5).
 *
 * Nothing of that reaches a browser — every action answers one translated
 * sentence, the error boundaries render fixed copy, and Next redacts a server
 * error to a digest. The log is the leak, and rules/deploy.md already holds the
 * principle it breaks: a database dump is exactly as sensitive as the database.
 * A container log is a partial, unrotated, unprotected one, and it is the file
 * somebody pastes into a chat window while they are debugging.
 *
 * The cut is between the code and the data. **The statement stays** — it is a
 * constant of this repo, it is what tells a reader which query died, and it
 * holds nothing anybody typed. **The parameters go**, and so does Postgres's
 * `detail`, which is where `Key (phone_normalized)=(+9665…) already exists`
 * lives. What is left is enough to find the bug: the SQL, the five-character
 * SQLSTATE, and the constraint by name.
 */

type Safe = {
  name: string;
  message: string;
  /** Postgres's own code — `23505` a unique violation, `22P02` a bad cast. */
  code?: string;
  constraint?: string;
  /** The statement, never its values. */
  query?: string;
  stack?: string;
};

/**
 * Duck-typed rather than `instanceof DrizzleQueryError`: the class lives at a
 * subpath of the package that has moved between versions, and the shape has
 * not. A wrong answer here loses a log line, never a guard.
 */
function isQueryError(error: unknown): error is { query: string; cause?: unknown } {
  return (
    typeof error === "object" &&
    error !== null &&
    "params" in error &&
    typeof (error as { query?: unknown }).query === "string"
  );
}

/** An error as it may be written down. Never throws; a logger that throws is worse than a quiet one. */
export function safeError(error: unknown): Safe {
  if (isQueryError(error)) {
    // Its own message carries the parameters, so the words come from the cause
    // underneath — the pg error, which is the one that actually says what went
    // wrong — and only the statement is kept from this layer.
    return { ...safeError(error.cause), query: error.query };
  }

  if (error instanceof Error) {
    const pg = error as Error & { code?: unknown; constraint?: unknown };
    return {
      name: error.name,
      message: error.message,
      ...(typeof pg.code === "string" ? { code: pg.code } : {}),
      ...(typeof pg.constraint === "string" ? { constraint: pg.constraint } : {}),
      ...(error.stack ? { stack: error.stack } : {}),
    };
  }

  // A thrown string could be anything; a thrown object could be a row.
  return { name: "unknown", message: `${typeof error} thrown` };
}
