import type { z } from "zod";

/** One message per field name the form knows, keyed the way the inputs are named. */
export type FieldErrors = Record<string, string>;

/**
 * A form value, trimmed, with "" read as "not filled in".
 *
 * Every optional field in every dialog depends on that reading: a text input
 * that was touched and cleared posts an empty string, and an empty string is
 * not a value a Zod `.optional()` accepts. Without this, clearing a note saved
 * "" and clearing a city failed validation instead of unsetting it.
 */
export function field(formData: FormData, name: string): string | undefined {
  const raw = formData.get(name);
  if (typeof raw !== "string") return undefined;
  const value = raw.trim();
  return value === "" ? undefined : value;
}

/**
 * Turns Zod's issues into the sentence each field shows, one per field.
 *
 * Only two sentences, because only two things can be wrong with a form value on
 * the way in: it is missing, or it is not the kind of thing the field takes.
 * Anything more specific — a number that is not in this country, a phone
 * already on the company — is a business answer and comes from the action
 * itself, in its own words.
 *
 * One copy, in one place: this lived in four action files, and four copies of a
 * message-shaping rule is how one screen ends up saying something the others do
 * not (DESIGN §5, one definition per figure).
 */
export function fieldErrorsOf(
  error: z.ZodError,
  required: string,
  invalid: string,
): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "");
    if (!key || out[key]) continue;
    out[key] = issue.code === "invalid_type" || issue.code === "too_small" ? required : invalid;
  }
  return out;
}
