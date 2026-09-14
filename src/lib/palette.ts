import "server-only";
import { and, desc, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { activities, auditLog, cities, companies, dispatches, quotations } from "@/db/schema";
import { dispatchEvent } from "@/lib/dispatch-events";
import { seesEveryDispatch } from "@/lib/dispatches";
import { dispatchLabel, quotationLabel } from "@/lib/labels";
import { quotationEvent } from "@/lib/quotation-events";
import { isLatestRevisionSql, seesEveryQuotation } from "@/lib/quotations";
import type { SessionUser } from "@/lib/types";
import { seesCompany } from "@/lib/visibility";

/**
 * What the search palette offers before anything is typed (lists-navigation:
 * the palette never opens to a blank box), and the one sentence both of its
 * halves use for which companies a reader is shown.
 *
 * "What he was busy with" is read from what the app already writes, and from
 * nothing kept for the purpose — there is no tracking table, and a list of
 * what somebody OPENED would be a second record of a day that the reports and
 * the trail already are:
 *
 * - **companies**: the ones his latest reports are about (`activities`), newest
 *   written first — the report is the act a rep does most, about a customer;
 * - **quotations and dispatches**: the papers he most recently raised or acted
 *   on, and the papers of his that somebody answered — issued or sent back, a
 *   load approved or refused — from `audit_log`, which records every one of
 *   those with who and when in the transaction that made it (D143). A figure
 *   about an act reads the act (rules/data.md); the columns on the paper say
 *   where it IS, not who touched it last.
 *
 * Every row is narrowed by the predicate the list it opens into already uses,
 * so nothing here is a record the reader could not open (D139, D147).
 */

/** How many of each kind: a short group, not a second list. */
const PER_KIND = 3;

/** The answers somebody else gives on a person's paper. */
const QUOTATION_ANSWERS = [quotationEvent("issue"), quotationEvent("sendBack")];
const DISPATCH_ANSWERS = [dispatchEvent("approve"), dispatchEvent("refuse")];

export type PaletteCompany = {
  id: string;
  name: string;
  city: string;
  /**
   * "The reader may OPEN this company" — his own, one shared with him, or any
   * of them for a manager. Only the coordinator's palette reads it: she is shown
   * every company by name and may open the ones on her own floor, so it sends
   * her to the drawer for those and to the paper for the rest (D139, SPEC §3).
   */
  mine: boolean;
};

/** A quotation or a dispatch, by Kladra's own name for it (D161: a picker keeps it). */
export type PalettePaper = { id: string; number: string; companyName: string };

export type RecentRecords = {
  companies: PaletteCompany[];
  quotations: PalettePaper[];
  dispatches: PalettePaper[];
};

/**
 * Which companies the palette names to this reader.
 *
 * A rep and marketing: their own floor, shared companies included. The
 * coordinator: every company, because her desk is the paper on everybody's
 * customers (D139) — which is exactly the rule that shows her every quotation,
 * so it is that rule and not a second one. The manager and the admin: all.
 */
export function paletteCompanies(actor: SessionUser): SQL | undefined {
  return seesEveryQuotation(actor) ? undefined : seesCompany(actor);
}

/** Whether a company row is one this reader may open, asked in the same statement. */
export function mayOpenCompanySql(actor: SessionUser): SQL<boolean> {
  return (seesCompany(actor) ?? sql`true`).mapWith(Boolean) as SQL<boolean>;
}

export async function recentFor(actor: SessionUser, locale: string): Promise<RecentRecords> {
  const cityName = locale === "ar" ? cities.nameAr : cities.nameEn;

  const companyRows = db
    .select({
      id: companies.id,
      name: companies.name,
      mine: mayOpenCompanySql(actor),
      cityName,
      cityText: companies.cityText,
    })
    .from(activities)
    .innerJoin(companies, eq(companies.id, activities.companyId))
    .leftJoin(cities, eq(cities.id, companies.cityId))
    .where(
      and(
        eq(activities.userId, actor.id),
        // An unfiled entry was written against the wrong customer (D70).
        isNull(activities.archivedAt),
        isNull(companies.archivedAt),
        paletteCompanies(actor),
      ),
    )
    .groupBy(companies.id, cities.id)
    .orderBy(desc(sql`max(${activities.createdAt})`))
    .limit(PER_KIND);

  const quotationRows = db
    .select({
      id: quotations.id,
      number: quotations.number,
      revision: quotations.revision,
      companyName: companies.name,
    })
    .from(auditLog)
    .innerJoin(quotations, sql`${auditLog.recordId} = ${quotations.id}::text`)
    .innerJoin(companies, eq(companies.id, quotations.companyId))
    .where(
      and(
        eq(auditLog.recordType, "quotation"),
        or(
          eq(auditLog.userId, actor.id),
          and(
            or(eq(quotations.repId, actor.id), eq(quotations.raisedById, actor.id)),
            inArray(auditLog.action, QUOTATION_ANSWERS),
          ),
        ),
        isNull(companies.archivedAt),
        // The live paper, as the list shows it (S34): a rep busy with Q-3 wants
        // Q-3/2, not the revision it replaced.
        isLatestRevisionSql(),
        seesEveryQuotation(actor) ? undefined : seesCompany(actor),
      ),
    )
    .groupBy(quotations.id, companies.id)
    .orderBy(desc(sql`max(${auditLog.at})`))
    .limit(PER_KIND);

  const dispatchRows = db
    .select({
      id: dispatches.id,
      number: dispatches.number,
      companyName: companies.name,
    })
    .from(auditLog)
    .innerJoin(dispatches, sql`${auditLog.recordId} = ${dispatches.id}::text`)
    .innerJoin(companies, eq(companies.id, dispatches.companyId))
    .where(
      and(
        eq(auditLog.recordType, "dispatch"),
        or(
          eq(auditLog.userId, actor.id),
          and(
            or(eq(dispatches.repId, actor.id), eq(dispatches.raisedById, actor.id)),
            inArray(auditLog.action, DISPATCH_ANSWERS),
          ),
        ),
        isNull(companies.archivedAt),
        seesEveryDispatch(actor) ? undefined : seesCompany(actor),
      ),
    )
    .groupBy(dispatches.id, companies.id)
    .orderBy(desc(sql`max(${auditLog.at})`))
    .limit(PER_KIND);

  const [foundCompanies, foundQuotations, foundDispatches] = await Promise.all([
    companyRows,
    quotationRows,
    dispatchRows,
  ]);

  return {
    companies: foundCompanies.map((row) => ({
      id: row.id,
      name: row.name,
      city: row.cityName ?? row.cityText ?? "",
      mine: Boolean(row.mine),
    })),
    quotations: foundQuotations.map((row) => ({
      id: row.id,
      number: quotationLabel(row.number, row.revision),
      companyName: row.companyName,
    })),
    dispatches: foundDispatches.map((row) => ({
      id: row.id,
      number: dispatchLabel(row.number),
      companyName: row.companyName,
    })),
  };
}
