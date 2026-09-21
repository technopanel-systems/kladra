/**
 * The customers file (SPEC §3, P14 14.10; D19 before it).
 *
 * One row per customer, with the person the office rings on it — the list
 * somebody asks for when they want "everyone we know". Everything is joined
 * already: an accountant opening this does not want to look a category up in a
 * second sheet.
 *
 * It is the companies SCREEN, exported. The same narrowing (`narrowCompanies`),
 * so a rep's file is a rep's floor and a search or a follow-up chip in the
 * address narrows the file exactly as it narrows the list he is looking at; and
 * no archived customers, because they are not on that screen either — the
 * admin's archive is where those are read.
 */
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  cities,
  companies,
  companyCategories,
  contacts,
  countries,
  leadSources,
  users,
} from "@/db/schema";
import { floorAsked, mainContactIdSql, narrowCompanies } from "@/lib/companies";
import type { Day } from "@/lib/dates";
import { exportDay, type ExportRead } from "@/lib/export/kit";
import { parseFollowUpFilter } from "@/lib/followups";
import { personName } from "@/lib/people";

export const companiesSheet: ExportRead = async ({ user, locale, params }) => {
  const ar = locale.startsWith("ar");
  const repId = floorAsked(user, params.get("rep"));

  const rows = await db
    .select({
      company: companies.name,
      // The city as the record holds it: a lookup where it is one, the typed
      // name where the country is not Saudi Arabia (SPEC §3).
      city: sql<string>`coalesce(${ar ? cities.nameAr : cities.nameEn}, ${companies.cityText}, '')`,
      country: ar ? countries.nameAr : countries.nameEn,
      category: ar ? companyCategories.nameAr : companyCategories.nameEn,
      lead_source: ar ? leadSources.nameAr : leadSources.nameEn,
      rep: personName(locale),
      main_contact: sql<string>`coalesce(${contacts.name}, '')`,
      phone: sql<string>`coalesce(${contacts.phoneNormalized}, '')`,
      email: sql<string>`coalesce(${contacts.email}, '')`,
      position: sql<string>`coalesce(${contacts.position}, '')`,
      added: sql<Day>`to_char((${companies.createdAt} at time zone 'Asia/Riyadh')::date, 'YYYY-MM-DD')`,
    })
    .from(companies)
    .innerJoin(users, eq(users.id, companies.repId))
    .innerJoin(companyCategories, eq(companyCategories.id, companies.categoryId))
    .innerJoin(leadSources, eq(leadSources.id, companies.leadSourceId))
    .innerJoin(countries, eq(countries.id, companies.countryId))
    .leftJoin(cities, eq(cities.id, companies.cityId))
    // Which contact is the main one is decided in ONE place (D18): the flag
    // alone says nobody is main once the marked contact has been archived, and
    // a copy of that rule here would agree today and drift later.
    .leftJoin(contacts, eq(contacts.id, mainContactIdSql(sql`companies.id`)))
    .where(
      and(
        ...narrowCompanies({
          user,
          locale,
          q: params.get("q") ?? undefined,
          filter: parseFollowUpFilter(params.get("filter")),
          repId,
        }),
      ),
    )
    .orderBy(asc(companies.name));

  return {
    columns: [
      "company",
      "city",
      "country",
      "category",
      "lead_source",
      "rep",
      "main_contact",
      "phone",
      "email",
      "position",
      "added",
    ],
    rows: rows.map((row) => ({ ...row, added: exportDay(row.added, locale) })),
  };
};
