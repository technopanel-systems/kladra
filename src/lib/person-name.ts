/**
 * A person's name, in the reader's script, from a row already read (SPEC D68).
 *
 * Its own file with no query in it, because the admin's list of people is a
 * client component: a VALUE imported from `@/lib/people` would pull `@/db`,
 * then Auth.js, then `server-only` into the browser bundle, which is the trap
 * `src/lib/picker-option.ts` already exists for (DESIGN §5).
 */
export function personNameFrom(
  person: { name: string; nameAr?: string | null },
  locale: string,
): string {
  const arabic = person.nameAr?.trim();
  return locale.startsWith("ar") && arabic ? arabic : person.name;
}
