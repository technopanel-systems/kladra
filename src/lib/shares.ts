import "server-only";

import { asc, eq } from "drizzle-orm";
import { getLocale } from "next-intl/server";
import { db } from "@/db";
import { companyShares, projectShares, users } from "@/db/schema";
import { personName } from "@/lib/people";

/** Somebody else who is on a customer or a job (D147). */
export type Sharer = { id: string; name: string };

/**
 * Who else is on this company, in the reader's language.
 *
 * The owner is not in the list. He is named already, everywhere a company is
 * drawn, and a list of "who else" that opens with the person whose company it
 * is answers a question nobody asked.
 */
export async function companySharers(companyId: string): Promise<Sharer[]> {
  const locale = await getLocale();
  return db
    .select({ id: users.id, name: personName(locale) })
    .from(companyShares)
    .innerJoin(users, eq(users.id, companyShares.userId))
    .where(eq(companyShares.companyId, companyId))
    .orderBy(asc(personName(locale)));
}

/** Who else is on this project. */
export async function projectSharers(projectId: string): Promise<Sharer[]> {
  const locale = await getLocale();
  return db
    .select({ id: users.id, name: personName(locale) })
    .from(projectShares)
    .innerJoin(users, eq(users.id, projectShares.userId))
    .where(eq(projectShares.projectId, projectId))
    .orderBy(asc(personName(locale)));
}
