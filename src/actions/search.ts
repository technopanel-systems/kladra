"use server";

import { and, asc, desc, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { db } from "@/db";
import { cities, companies, contacts, projects, quotations } from "@/db/schema";
import { NotAllowed, refusalKey, requireActor, seesAll } from "@/lib/authz";
import { ownsCompanies } from "@/lib/floor";
import { normalizePhone, storedE164, type E164 } from "@/lib/phone";
import type { ActionResult, SessionUser } from "@/lib/types";
import { seesCompany } from "@/lib/visibility";

/**
 * Global search — the Ctrl+K palette (SPEC §3).
 *
 * Every condition, including who is allowed to see which row, is resolved in
 * SQL before the limit (rules/data.md: filtering a fetched page returns
 * silently wrong screens). Five per group, four groups, run together.
 *
 * Who sees what (SPEC S8, S9, §3): a rep only his own companies, contacts,
 * projects and quotations; manager and admin everything. The coordinator is the
 * one person the two halves differ for. Her DESK is every company and every
 * quotation in the building, because her job is the paper on somebody else's
 * customer; her FLOOR is the handful she sells herself, and the contacts and
 * projects she is offered are only those. Both of those are the same split
 * `mayOpen`/`mayWrite` has kept since D42, asked of a search box.
 */

export type SearchResults = {
  /**
   * `mine` is "the reader may OPEN this company" — his own, one shared with
   * him, or any of them for a manager. Only the coordinator's palette reads it:
   * she is shown every company by name and may open the ones on her own floor,
   * so it sends her to the drawer for those and to the paper for the rest
   * (D139, SPEC §3).
   */
  companies: { id: string; name: string; city: string; mine: boolean }[];
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
  } catch (error) {
    const t = await getTranslations("common");
    // A session that has ended says so, not "you are not allowed" (D135).
    if (error instanceof NotAllowed) return { ok: false, error: t(refusalKey(error)) };
    return { ok: false, error: t("somethingWrong") };
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
  // Marketing searches its own floor exactly as a rep searches his: the
  // question is "are these companies mine", and both answer yes (P8.9).
  const isRep = ownsCompanies(actor.role);
  const isCoordinator = actor.role === "coordinator";

  // The rep filter is a column comparison, so it lands in the WHERE clause and
  // the limit applies to rows he is allowed to see, never to a page of them.
  //
  // The coordinator holds a floor of her own since SPEC §3 and is deliberately
  // NOT narrowed to it here. What she wants a company for at the palette is the
  // paper on it — every rep's, which is her desk (D139) — and a search that
  // returned only her own customers would hide the ones she quotes all day. She
  // is the one person whose floor and whose reading are different questions,
  // which is exactly the split `mayOpen`/`mayWrite` exists for.
  const ownCompany: SQL | undefined = isRep && !isCoordinator ? seesCompany(actor) : undefined;
  // And the other half of her: the groups that are about WORKING a customer
  // rather than about the paper on him. A contact and a project belong to a
  // floor, and since §3 she has one — this is the same narrowing every rep
  // gets, asked of her too, where `ownCompany` above deliberately lets her past.
  const myFloor: SQL | undefined = all ? undefined : seesCompany(actor);
  if (!all && !isRep && !isCoordinator) return EMPTY;

  const companyRows = db
    .select({
      id: companies.id,
      name: companies.name,
      // Asked of the database with the same predicate that narrows every other
      // group, rather than compared to an id here: a company SHARED with the
      // reader is one he may open, and `rep_id = me` would have sent him to a
      // screen for somebody else's paper about a customer he works (D147).
      mine: (seesCompany(actor) ?? sql`true`).mapWith(Boolean),
      cityName: cityName,
      cityText: companies.cityText,
    })
    .from(companies)
    .leftJoin(cities, eq(cities.id, companies.cityId))
    .where(and(isNull(companies.archivedAt), ilike(companies.name, anywhere), ownCompany))
    .orderBy(sql`case when ${companies.name} ilike ${prefix} then 0 else 1 end`, asc(companies.name))
    .limit(PER_GROUP);

  const contactRows = db
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
            myFloor,
          ),
        )
        .orderBy(asc(contacts.name))
        .limit(PER_GROUP);

  const projectRows = db
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
            myFloor,
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
        // The same clause the companies above use, and the same one the
        // quotations LIST uses (D147). It asked `quotations.rep_id` here and
        // `companies.rep_id` there, which agreed while a company had one rep
        // and would have disagreed the day one was shared — a search that
        // finds a paper the list will not show, or hides one it will.
        ownCompany,
      ),
    )
    .orderBy(desc(quotations.number), desc(quotations.revision))
    .limit(PER_GROUP);

  const [foundCompanies, foundContacts, foundProjects, foundQuotations] = await Promise.all([
    companyRows,
    contactRows,
    projectRows,
    quotationRows,
  ]);

  return {
    companies: foundCompanies.map((row) => ({
      id: row.id,
      name: row.name,
      city: row.cityName ?? row.cityText ?? "",
      mine: Boolean(row.mine),
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
