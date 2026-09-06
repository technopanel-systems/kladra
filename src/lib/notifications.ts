/**
 * Reading notifications. Writing them is src/lib/notify.ts, which is also where
 * the vocabulary of kinds lives.
 *
 * A notification is not a copy of what happened; it is a pointer at it. The
 * sentence is built at read time from the kind and its params, in the reader's
 * language (D13) — so a rep who switches to English sees English on a notice
 * that was written while he was in Arabic. And `link` is where the thing itself
 * is, because a notice a person cannot act on is a notice they learn to ignore
 * (S52: a reminder is cleared by doing the work).
 *
 * No `import "server-only"`, for the reason in src/lib/live.ts.
 */
import { desc, eq, inArray, sql } from "drizzle-orm";
import { getLocale } from "next-intl/server";
import { db } from "@/db";
import { companies, dispatches, notifications, quotations, users } from "@/db/schema";
import type { NotificationSubjectType } from "@/db/schema";
import type { NotificationKind } from "@/lib/notify";
import { personName } from "@/lib/people";

export type NotificationRow = {
  id: string;
  kind: NotificationKind;
  params: Record<string, string | number>;
  link: string;
  read: boolean;
  /** The Riyadh day it arrived, as text (rules/data.md). */
  day: string;
};

/**
 * The most recent notices for one person, read and unread together.
 *
 * Capped rather than paged: a notice from three weeks ago is history, and the
 * things it points at are all still on their own screens. Fifty is more than
 * anybody scrolls.
 */
export async function listNotifications(userId: string, limit = 50): Promise<NotificationRow[]> {
  const locale = await getLocale();
  const rows = await db
    .select({
      id: notifications.id,
      kind: notifications.kind,
      params: notifications.params,
      link: notifications.link,
      subjectType: notifications.subjectType,
      subjectId: notifications.subjectId,
      readAt: notifications.readAt,
      day: sql<string>`to_char((${notifications.createdAt} at time zone 'Asia/Riyadh')::date, 'YYYY-MM-DD')`,
    })
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);

  /*
   * The person in the sentence is stored as an ID and named here, in the script
   * the reader is reading (D68). It used to be stored as the actor's Latin name
   * at write time, so «طلب Faisal Al-Harbi عرض السعر Q-1» was what Rawan read on
   * the one screen in the app that keeps a copy of a name instead of joining for
   * it — which is also the screen whose whole design is that the sentence is
   * built at read time and the row holds no words (D13).
   */
  const [people, customers] = await Promise.all([
    namesOf(rows.map((row) => String(row.params?.repId ?? "")), locale),
    customersOf(rows),
  ]);
  return rows.map((row) => {
    const params = { ...((row.params ?? {}) as Record<string, string | number>) };
    const repId = typeof params.repId === "string" ? params.repId : null;
    if (repId) {
      delete params.repId;
      params.rep = people.get(repId) ?? "";
    }
    // The customer in the sentence, from the notice's own subject (D110): a
    // row written last year names him too, and a renamed company reads right.
    params.company = customers.get(`${row.subjectType}:${row.subjectId}`) ?? "";
    return {
      id: row.id,
      kind: row.kind as NotificationKind,
      params,
      link: row.link,
      read: row.readAt !== null,
      day: row.day,
    };
  });
}

/**
 * The customer behind each notice, by its subject (D110). "Q-12 came back for
 * edits" told a rep with eight open quotations nothing until he remembered
 * which customer Q-12 was; the notice carries what it is ABOUT (D79), so the
 * company is a join at read time and never a copy — the rule the rep's own
 * name already follows (D68). Three small queries, one per kind of subject,
 * only for the kinds on the page.
 */
async function customersOf(
  rows: readonly { subjectType: NotificationSubjectType; subjectId: string }[],
): Promise<Map<string, string>> {
  const ids = (type: NotificationSubjectType) =>
    [...new Set(rows.filter((row) => row.subjectType === type).map((row) => row.subjectId))];
  const [byQuotation, byDispatch, byCompany] = await Promise.all([
    ids("quotation").length === 0
      ? []
      : db
          .select({ id: quotations.id, name: companies.name })
          .from(quotations)
          .innerJoin(companies, eq(companies.id, quotations.companyId))
          .where(inArray(quotations.id, ids("quotation"))),
    ids("dispatch").length === 0
      ? []
      : db
          .select({ id: dispatches.id, name: companies.name })
          .from(dispatches)
          .innerJoin(quotations, eq(quotations.id, dispatches.quotationId))
          .innerJoin(companies, eq(companies.id, quotations.companyId))
          .where(inArray(dispatches.id, ids("dispatch"))),
    ids("company").length === 0
      ? []
      : db
          .select({ id: companies.id, name: companies.name })
          .from(companies)
          .where(inArray(companies.id, ids("company"))),
  ]);
  return new Map([
    ...byQuotation.map((row) => [`quotation:${row.id}`, row.name] as const),
    ...byDispatch.map((row) => [`dispatch:${row.id}`, row.name] as const),
    ...byCompany.map((row) => [`company:${row.id}`, row.name] as const),
  ]);
}

/** The names behind a page of notices, in one query and in the reader's script. */
async function namesOf(ids: string[], locale: string): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter(Boolean))];
  if (wanted.length === 0) return new Map();
  const rows = await db
    .select({ id: users.id, name: personName(locale) })
    .from(users)
    .where(inArray(users.id, wanted));
  return new Map(rows.map((row) => [row.id, row.name]));
}
