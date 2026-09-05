import { sql, type SQL } from "drizzle-orm";
import { users } from "@/db/schema";

/**
 * A person's name, in the script the reader is reading (SPEC D68).
 *
 * Every lookup in this system already carries two names — a city, a category, a
 * lead source, a thickness — and the people carried one, so an Arabic screen
 * named Rawan's colleagues in Latin: "Faisal Al-Harbi" under a heading that said
 * المندوب, and an account whose name was the English word Marketing. The column
 * is optional and falls back, because a name typed twice can disagree and the
 * second copy is the one that drifts (D64) — an account added in a hurry has one
 * name and shows it to everybody.
 *
 * Not used by `src/lib/export.ts`: a CSV is a machine's file and takes the
 * English column everywhere, the same way it takes `name_en` for the country
 * and the category beside it.
 */
export function personName(locale: string): SQL<string> {
  return locale.startsWith("ar")
    ? sql<string>`coalesce(nullif(${users.nameAr}, ''), ${users.name})`
    : sql<string>`${users.name}`;
}

/**
 * The same, for a query that joined the table under its own alias. The alias is
 * written by the caller into its own SQL, so it is passed here rather than
 * guessed: `personNameOf("u", locale)` beside `join users u on …`.
 */
export function personNameOf(alias: string, locale: string): SQL<string> {
  const name = sql.raw(`${alias}.name`);
  const nameAr = sql.raw(`${alias}.name_ar`);
  return locale.startsWith("ar")
    ? sql<string>`coalesce(nullif(${nameAr}, ''), ${name})`
    : sql<string>`${name}`;
}

// The row-shaped one lives in `src/lib/person-name.ts`, which has no query in
// it, so a client component can import it. Re-exported here so server code has
// one place to look.
export { personNameFrom } from "@/lib/person-name";
