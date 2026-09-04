/**
 * The lists behind every dropdown on the rep floor.
 *
 * Two orders, and they are not interchangeable (src/db/schema.ts):
 *   `sort_order` — the admin's manual order, where alphabetical means nothing.
 *                  Categories and lead sources are the founder's own order and
 *                  "Other" carries the highest, so it lands last (SPEC §3).
 *   `pinned`     — 1..n for the values typed nine times in ten; everything else
 *                  sorts alphabetically after them (DESIGN §2, SPEC D7).
 *                  Countries: Saudi Arabia · UAE · Bahrain · Kuwait · Qatar ·
 *                  Oman. Cities: Riyadh · Jeddah · Dammam · Al Khobar · Makkah
 *                  · Madinah.
 *
 * Names come back already in the reader's language — a screen never picks
 * between `name_en` and `name_ar` for itself. Deactivated rows never appear:
 * the admin turns a value off and it stops being offered, while the rows that
 * already point at it keep reading correctly.
 *
 * No `import "server-only"`, for the reason in src/lib/live.ts.
 */
import { and, asc, eq, sql } from "drizzle-orm";
import { getLocale } from "next-intl/server";
import { db } from "@/db";
import { cities, companyCategories, countries, leadSources, positions } from "@/db/schema";

/** The one country whose cities are a picked list rather than free text. */
export const SAUDI_CODE = "SA";

/**
 * `name` is the reader's language; `alt` is the same row in the other script.
 * `alt` is never rendered — it is what a dropdown searches on, so a rep working
 * in Arabic still finds "Riyadh" and one working in English still finds
 * "الرياض" (SPEC D7). Both are selected in the one statement; asking twice
 * would be a second round trip for a string we already have in hand.
 */
export type LookupOption = { id: number; name: string; alt: string };
export type CountryOption = {
  id: number;
  code: string;
  name: string;
  alt: string;
  pinned: number | null;
};
export type CityOption = { id: number; name: string; alt: string; pinned: number | null };

/**
 * The locale to label with. Callers inside a request may omit it; host-side
 * scripts and tests pass one, because `getLocale()` needs a request scope.
 */
async function labelLocale(locale?: string): Promise<string> {
  return locale ?? (await getLocale());
}

function isArabic(locale: string): boolean {
  return locale.startsWith("ar");
}

/** Factory · Contractor · … · Other. The founder's order, "Other" last (D2). */
export async function listCategories(locale?: string): Promise<LookupOption[]> {
  const l = await labelLocale(locale);
  return db
    .select({
      id: companyCategories.id,
      name: isArabic(l) ? companyCategories.nameAr : companyCategories.nameEn,
      alt: isArabic(l) ? companyCategories.nameEn : companyCategories.nameAr,
    })
    .from(companyCategories)
    .where(eq(companyCategories.active, true))
    .orderBy(asc(companyCategories.sortOrder), asc(companyCategories.nameEn));
}

/** Field visit · Direct contact · … · Other. "Other" last (D1). */
export async function listLeadSources(locale?: string): Promise<LookupOption[]> {
  const l = await labelLocale(locale);
  return db
    .select({
      id: leadSources.id,
      name: isArabic(l) ? leadSources.nameAr : leadSources.nameEn,
      alt: isArabic(l) ? leadSources.nameEn : leadSources.nameAr,
    })
    .from(leadSources)
    .where(eq(leadSources.active, true))
    .orderBy(asc(leadSources.sortOrder), asc(leadSources.nameEn));
}

/**
 * Owner · General manager · … · Other (D21). The contact stores the TEXT it
 * picks, not this id — a rep may type a position that is not on the list.
 */
export async function listPositions(locale?: string): Promise<LookupOption[]> {
  const l = await labelLocale(locale);
  return db
    .select({
      id: positions.id,
      name: isArabic(l) ? positions.nameAr : positions.nameEn,
      alt: isArabic(l) ? positions.nameEn : positions.nameAr,
    })
    .from(positions)
    .where(eq(positions.active, true))
    .orderBy(asc(positions.sortOrder), asc(positions.nameEn));
}

/**
 * The six pinned ones in SPEC order, then every other country alphabetically by
 * its localized name. `nulls last` is explicit: Postgres sorts NULLs FIRST in
 * an ascending order, which would put the whole ISO list above the Gulf.
 */
export async function listCountries(locale?: string): Promise<CountryOption[]> {
  const l = await labelLocale(locale);
  const name = isArabic(l) ? countries.nameAr : countries.nameEn;
  const alt = isArabic(l) ? countries.nameEn : countries.nameAr;
  return db
    .select({ id: countries.id, code: countries.code, name, alt, pinned: countries.pinned })
    .from(countries)
    .where(eq(countries.active, true))
    .orderBy(sql`${countries.pinned} asc nulls last`, asc(name));
}

/**
 * The cities offered for a country: pinned six first, then alphabetical.
 *
 * Empty for anything but Saudi Arabia — outside the Kingdom the city is free
 * text on the company (SPEC §3), and an empty list is what tells the form to
 * switch. The country's code is checked in the same statement rather than in a
 * second round trip.
 */
export async function listCitiesForCountry(
  countryId: number,
  locale?: string,
): Promise<CityOption[]> {
  if (!Number.isInteger(countryId) || countryId <= 0) return [];
  const l = await labelLocale(locale);
  const name = isArabic(l) ? cities.nameAr : cities.nameEn;
  const alt = isArabic(l) ? cities.nameEn : cities.nameAr;
  return db
    .select({ id: cities.id, name, alt, pinned: cities.pinned })
    .from(cities)
    .innerJoin(countries, eq(countries.id, cities.countryId))
    .where(
      and(
        eq(cities.countryId, countryId),
        eq(cities.active, true),
        eq(countries.code, SAUDI_CODE),
      ),
    )
    .orderBy(sql`${cities.pinned} asc nulls last`, asc(name));
}

/** Does this country pick its city from a list, or type it? */
export async function isSaudi(countryId: number): Promise<boolean> {
  if (!Number.isInteger(countryId) || countryId <= 0) return false;
  const [row] = await db
    .select({ code: countries.code })
    .from(countries)
    .where(eq(countries.id, countryId))
    .limit(1);
  return row?.code === SAUDI_CODE;
}

/**
 * What the Add company dialog opens on: Saudi Arabia and Riyadh, the answer
 * nine times in ten (DESIGN §2). Either may be null on a database whose lookups
 * were edited; the form then opens with nothing selected rather than guessing.
 */
export async function defaultLocation(): Promise<{
  countryId: number | null;
  cityId: number | null;
}> {
  const [country] = await db
    .select({ id: countries.id })
    .from(countries)
    .where(and(eq(countries.code, SAUDI_CODE), eq(countries.active, true)))
    .limit(1);
  if (!country) return { countryId: null, cityId: null };

  const [city] = await db
    .select({ id: cities.id })
    .from(cities)
    .where(and(eq(cities.countryId, country.id), eq(cities.pinned, 1), eq(cities.active, true)))
    .limit(1);

  return { countryId: country.id, cityId: city?.id ?? null };
}
