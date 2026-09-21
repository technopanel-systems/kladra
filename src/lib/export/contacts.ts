/**
 * The contacts file (SPEC §3, P14 14.10; D18 before it).
 *
 * The people at the customers — one row per contact, the company repeated on
 * each, so a rep handed this has every number he could ring in one column and
 * never has to look a company up in a second sheet.
 *
 * It is the companies SCREEN, exported: these are the contacts OF the customers
 * that screen is showing, narrowed by the same `narrowCompanies` the customers
 * file asks and fed from the address with the same parsers — `?q=`, `?filter=`
 * and `?rep=` — so a search, a follow-up chip or a manager's drill-down into one
 * rep's floor narrows this file exactly as it narrows the list he is looking at.
 * No archived contacts and no archived customers, because neither is on that
 * screen either. Uncapped, where the list is capped at two hundred (D80): a
 * screen is read from the top and a file is added up.
 *
 * The one thing a reader would otherwise be surprised by is `main`. Which
 * contact is the main one is decided in ONE place (`mainContactIdSql`, D18) and
 * never by the flag alone, which says nobody is main once the marked contact
 * has been archived; and it is asked per COMPANY, the answer the list and the
 * customers file show, not the per-rep answer the drawer draws on a shared
 * customer. It is yes or no, the two words a file has and a screen does not
 * (messages/<locale>/export.json): a screen says a flag with a badge or by
 * drawing nothing, and a blank cell in a spreadsheet reads as "not known".
 */
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import { companies, contacts } from "@/db/schema";
import { mainContactIdSql, narrowCompanies } from "@/lib/companies";
import type { Day } from "@/lib/dates";
import { exportDay, type ExportRead } from "@/lib/export/kit";
import { parseFollowUpFilter } from "@/lib/followups";

export const contactsSheet: ExportRead = async ({ user, locale, params }) => {
  const [t, rows] = await Promise.all([
    getTranslations({ locale }),
    db
      .select({
        company: companies.name,
        contact: contacts.name,
        position: sql<string>`coalesce(${contacts.position}, '')`,
        // Stored E.164 and written that way: a number is text, never a figure,
        // and a spreadsheet that reads +966… as one loses the leading digits.
        phone: contacts.phoneNormalized,
        email: sql<string>`coalesce(${contacts.email}, '')`,
        // The company's main contact (D18), asked of the one definition. Both
        // tables are named outright inside the subquery, which is what keeps a
        // correlated condition from resolving inside `ct` (rules/data.md).
        main: sql`${contacts.id} = ${mainContactIdSql(sql`companies.id`)}`.mapWith(Boolean),
        notes: sql<string>`coalesce(${contacts.notes}, '')`,
        added: sql<Day>`to_char((${contacts.createdAt} at time zone 'Asia/Riyadh')::date, 'YYYY-MM-DD')`,
      })
      .from(companies)
      .innerJoin(contacts, eq(contacts.companyId, companies.id))
      .where(
        and(
          isNull(contacts.archivedAt),
          ...narrowCompanies({
            user,
            locale,
            q: params.get("q") ?? undefined,
            filter: parseFollowUpFilter(params.get("filter")),
            repId: params.get("rep") ?? undefined,
          }),
        ),
      )
      // The customer, then that customer's people in the order the drawer lists
      // them: the main one at the top, the rest oldest first.
      .orderBy(asc(companies.name), sql`contacts.is_main desc`, asc(contacts.createdAt)),
  ]);

  return {
    columns: ["company", "contact", "position", "phone", "email", "main", "notes", "added"],
    // Nothing here is added up. The phone is the one column that looks like a
    // figure and is not (src/lib/csv.ts).
    rows: rows.map((row) => ({
      ...row,
      // Yes or no, the file's own two words (messages/<locale>/export.json).
      // The screens say a flag with a badge or by drawing nothing; a column of
      // blanks under a heading is a column a reader has to guess at, and the
      // one thing an accountant does with a flag is sort and filter on it.
      main: t(row.main ? "export.yes" : "export.no"),
      added: exportDay(row.added, locale),
    })),
  };
};
