"use server";

import { and, asc, desc, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { db } from "@/db";
import { cities, companies, contacts, projects, quotations } from "@/db/schema";
import { requireActor, seesAll } from "@/lib/authz";
import { normalizePhone, storedE164, type E164 } from "@/lib/phone";
import type { ActionResult, SessionUser } from "@/lib/types";

/**
 * Global search — the Ctrl+K palette (SPEC §3).
 *
 * Every condition, including who is allowed to see which row, is resolved in
 * SQL before the limit (rules/data.md: filtering a fetched page returns
 * silently wrong screens). Five per group, four groups, run together.
 *
 * Who sees what (SPEC S8, S9): a rep only his own companies, contacts,
 * projects and quotations; manager and admin everything; the coordinator owns
 * no relationships, so she gets the two things her desk needs to find — a
 * company by name and a quotation by its number.
 */

export type SearchResults = {
  companies: { id: string; name: string; city: string }[];
  contacts: { id: string; name: string; phone: E164; companyId: string; companyName: string }[];
  projects: { id: string; name: string; companyName: string }[];
  quotations: { id: string; number: string; companyName: string }[];
};

const EMPTY: SearchResults = { companies: [], contacts: [], projects: [], quotations: [] };

const PER_GROUP = 5;
const MIN_TERM = 2;

const querySchema = z.string().max(120);

/** `%` and `_` are ILIKE wildcards; a rep typing them means the characters. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => "\\" + match);
}

/**
 * What to look for in `contacts.phone_normalized`. A whole number typed in any
 * accepted shape (05x, +966, 00966) normalizes to E.164; a partial one falls
 * back to its digits without the local trunk zero, matched anywhere inside the
 * stored number.
 */
function phoneNeedle(term: string): string | null {
  const normalized = normalizePhone(term);
  if (normalized) return normalized;
  const digits = term.replace(/\D/g, "");
  if (digits.length < 4) return null;
  return digits.replace(/^0+/, "");
}

export async function searchAllAction(q: string): Promise<ActionResult<SearchResults>> {
  let actor: SessionUser;
  try {
    actor = await requireActor();
  } catch {
    const t = await getTranslations("common");
    return { ok: false, error: t("notAllowed") };
  }

  const parsed = querySchema.safeParse(q);
  const term = parsed.success ? parsed.data.trim() : "";
  if (term.length < MIN_TERM) return { ok: true, data: EMPTY };

  try {
    return { ok: true, data: await runSearch(actor, term) };
  } catch {
    const t = await getTranslations("common");
    return { ok: false, error: t("somethingWrong") };
  }
}

async function runSearch(actor: SessionUser, term: string): Promise<SearchResults> {
  const locale = await getLocale();
  const cityName = locale === "ar" ? cities.nameAr : cities.nameEn;

  const escaped = escapeLike(term);
  const anywhere = `%${escaped}%`;
  const prefix = `${escaped}%`;
  const needle = phoneNeedle(term);
  const digits = term.replace(/\D/g, "");

  const all = seesAll(actor);
  const isRep = actor.role === "rep";
  const isCoordinator = actor.role === "coordinator";

  // The rep filter is a column comparison, so it lands in the WHERE clause and
  // the limit applies to rows he is allowed to see, never to a page of them.
  const ownCompany: SQL | undefined = isRep ? eq(companies.repId, actor.id) : undefined;
  const ownQuotation: SQL | undefined = isRep ? eq(quotations.repId, actor.id) : undefined;
  if (!all && !isRep && !isCoordinator) return EMPTY;

  const companyRows = db
    .select({
      id: companies.id,
      name: companies.name,
      cityName: cityName,
      cityText: companies.cityText,
    })
    .from(companies)
    .leftJoin(cities, eq(cities.id, companies.cityId))
    .where(and(isNull(companies.archivedAt), ilike(companies.name, anywhere), ownCompany))
    .orderBy(sql`case when ${companies.name} ilike ${prefix} then 0 else 1 end`, asc(companies.name))
    .limit(PER_GROUP);

  const contactRows = isCoordinator
    ? null
    : db
        .select({
          id: contacts.id,
          name: contacts.name,
          phone: contacts.phoneNormalized,
          companyId: contacts.companyId,
          companyName: companies.name,
        })
        .from(contacts)
        .innerJoin(companies, eq(companies.id, contacts.companyId))
        .where(
          and(
            isNull(contacts.archivedAt),
            isNull(companies.archivedAt),
            or(
              ilike(contacts.name, anywhere),
              needle ? ilike(contacts.phoneNormalized, `%${escapeLike(needle)}%`) : undefined,
            ),
            ownCompany,
          ),
        )
        .orderBy(asc(contacts.name))
        .limit(PER_GROUP);

  const projectRows = isCoordinator
    ? null
    : db
        .select({
          id: projects.id,
          name: projects.name,
          companyName: companies.name,
        })
        .from(projects)
        .innerJoin(companies, eq(companies.id, projects.companyId))
        .where(
          and(
            isNull(projects.archivedAt),
            isNull(companies.archivedAt),
            ilike(projects.name, anywhere),
            ownCompany,
          ),
        )
        .orderBy(
          sql`case when ${projects.name} ilike ${prefix} then 0 else 1 end`,
          asc(projects.name),
        )
        .limit(PER_GROUP);

  const quotationRows = db
    .select({
      id: quotations.id,
      number: quotations.number,
      revision: quotations.revision,
      companyName: companies.name,
    })
    .from(quotations)
    .innerJoin(companies, eq(companies.id, quotations.companyId))
    .where(
      and(
        isNull(companies.archivedAt),
        or(
          // Q-12, 12, or the SMAC number typed straight in.
          digits ? sql`cast(${quotations.number} as text) like ${digits + "%"}` : undefined,
          ilike(quotations.smacNumber, anywhere),
          ilike(companies.name, anywhere),
        ),
        ownQuotation,
      ),
    )
    .orderBy(desc(quotations.number), desc(quotations.revision))
    .limit(PER_GROUP);

  const [foundCompanies, foundContacts, foundProjects, foundQuotations] = await Promise.all([
    companyRows,
    contactRows ?? Promise.resolve([]),
    projectRows ?? Promise.resolve([]),
    quotationRows,
  ]);

  return {
    companies: foundCompanies.map((row) => ({
      id: row.id,
      name: row.name,
      city: row.cityName ?? row.cityText ?? "",
    })),
    contacts: foundContacts.map((row) => ({
      id: row.id,
      name: row.name,
      phone: storedE164(row.phone),
      companyId: row.companyId,
      companyName: row.companyName,
    })),
    projects: foundProjects.map((row) => ({
      id: row.id,
      name: row.name,
      companyName: row.companyName,
    })),
    quotations: foundQuotations.map((row) => ({
      id: row.id,
      // Q-12, and Q-12/2 for a revision (SPEC D10). Never an internal id.
      number: row.revision > 1 ? `Q-${row.number}/${row.revision}` : `Q-${row.number}`,
      companyName: row.companyName,
    })),
  };
}
