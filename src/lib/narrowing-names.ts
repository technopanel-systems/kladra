/**
 * The names behind a door's address, so a list opened from a figure can say
 * what it is showing (D80: a screen says what it is not showing; D117).
 *
 * The address carries ids — a person, a segment, a source, a city — because an
 * id is what a predicate narrows by and a name can be renamed. The sentence over
 * the list is read in words, in the reader's script (D68), so they are looked
 * up here, once per list, from the lookups the admin edits.
 */
import "server-only";

import { inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { cities, companyCategories, leadSources, users } from "@/db/schema";
import type { Narrowing } from "@/lib/narrowing";
import { personName } from "@/lib/people";

export type NarrowingNames = {
  person: string | null;
  segments: string[];
  sources: string[];
  /** A picked city by name, a typed one as it was typed (folded), and null for none. */
  cities: (string | null)[];
};

export async function narrowingNames(narrowing: Narrowing, locale: string): Promise<NarrowingNames> {
  const ar = locale.startsWith("ar");
  const cityIds = narrowing.city.filter((key) => /^\d+$/.test(key)).map(Number);

  const [person, segments, sources, picked] = await Promise.all([
    narrowing.credited
      ? db
          .select({ name: personName(locale) })
          .from(users)
          .where(sql`${users.id} = ${narrowing.credited}::uuid`)
          .limit(1)
      : Promise.resolve([]),
    narrowing.segment.length > 0
      ? db
          .select({ id: companyCategories.id, name: ar ? companyCategories.nameAr : companyCategories.nameEn })
          .from(companyCategories)
          .where(inArray(companyCategories.id, narrowing.segment))
      : Promise.resolve([]),
    narrowing.source.length > 0
      ? db
          .select({ id: leadSources.id, name: ar ? leadSources.nameAr : leadSources.nameEn })
          .from(leadSources)
          .where(inArray(leadSources.id, narrowing.source))
      : Promise.resolve([]),
    cityIds.length > 0
      ? db
          .select({ id: cities.id, name: ar ? cities.nameAr : cities.nameEn })
          .from(cities)
          .where(inArray(cities.id, cityIds))
      : Promise.resolve([]),
  ]);

  const cityName = new Map(picked.map((row) => [String(row.id), row.name]));
  return {
    person: person[0]?.name ?? null,
    segments: segments.map((row) => row.name),
    sources: sources.map((row) => row.name),
    cities: narrowing.city.map((key) =>
      key === "-" ? null : key.startsWith("t:") ? key.slice(2) : (cityName.get(key) ?? key),
    ),
  };
}
