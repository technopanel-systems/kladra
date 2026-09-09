/**
 * What a person may create something on, right now.
 *
 * Three lists screens had no primary action of their own until P8, because a
 * project is created inside its company, a quotation inside a project and a
 * dispatch against a quotation — so the button lived on the parent and Jerom,
 * standing on the Projects screen, had to go and find one. His ruling: if the
 * thing needs a parent, the button asks for the parent. That is what these are.
 *
 * Every one of them is scoped to the floor the person may WRITE on, which is
 * their own and nobody else's whatever their role (D42, `mayWrite`) — a manager
 * reading Faisal's projects is not offered a button that would refuse him.
 *
 * A `hint` is the parent's own name, kept as its own string rather than joined
 * to the label, because two names either side of a separator is D46.
 *
 * No `import "server-only"`, for the reason in src/lib/live.ts.
 */
import { companiesOf, projectOptionValue } from "@/lib/picker-option";
import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { getLocale } from "next-intl/server";
import { db } from "@/db";
import { personName } from "@/lib/people";
import { companies, projects, quotations, users } from "@/db/schema";
import { committedQtySql } from "@/lib/dispatches";
import { holdsFloor, sells } from "@/lib/floor";
import { onProjectSql } from "@/lib/visibility";
import { quotationLabel } from "@/lib/labels";
import type { PickerOption, QuotationTargets } from "@/lib/picker-option";
import { DISPATCHABLE, isLatestRevisionSql } from "@/lib/quotations";
import type { Role, SessionUser } from "@/lib/types";

export type { PickerOption };

/**
 * The companies this person may add a project to: their own, not archived.
 *
 * A share is not one of them. Seeing a customer lets a rep keep his own people
 * on it and nothing else (D147, `mayKeepContacts`); the job belongs to whoever
 * holds the customer. The two other halves of `mayWrite` are asked here for the
 * reason they are asked in every picker below: a role with no floor and an admin
 * looking through somebody's eyes write nothing (D42).
 */
export async function companyOptions(user: SessionUser): Promise<PickerOption[]> {
  if (!holdsFloor(user.role) || user.viewedBy) return [];

  const rows = await db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .where(and(eq(companies.repId, user.id), isNull(companies.archivedAt)))
    .orderBy(asc(companies.name));

  return rows.map((row) => ({ value: row.id, label: row.name }));
}

/**
 * The projects this person may raise a quotation on.
 *
 * A lost project is finished work (S20) and an archived one is off the floor,
 * so neither is offered — quoting either would be a mistake nobody would spot
 * until the coordinator asked why.
 *
 * **The sentence is `mayRaiseFor`'s, in SQL, and it has THREE ways in.** It had
 * two — his own project, or a job he was put on — and the project drawer, which
 * asks `mayRaiseFor` directly, has always had three: the customer is his. So a
 * rep whose own company carried a project another rep created was offered the
 * button on the project's drawer and not on the Quotations screen, and the
 * action behind both accepted it. That is the defect `onProjectSql` warns about
 * turned the other way round: not a control that refuses, but work a screen
 * withholds. It surfaced the day a fold moved one rep's project onto another
 * rep's company (§5 #177) — which is exactly the arrangement D147 made ordinary.
 */
export async function projectOptions(user: SessionUser): Promise<PickerOption[]> {
  // Nothing to offer somebody who does not quote: the Quotations screen then
  // draws no button at all, rather than one that would be refused (P8.9). The
  // other two halves of `mayWrite` belong here for the same reason: a role that
  // holds no floor, and an admin looking through somebody's eyes, write nothing
  // (D42) — and a picker is a control like any other.
  if (!sells(user.role) || !holdsFloor(user.role) || user.viewedBy) return [];

  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      companyId: companies.id,
      companyName: companies.name,
    })
    .from(projects)
    .innerJoin(companies, eq(companies.id, projects.companyId))
    .where(
      and(
        // His customer, his own job, or a job he has been put on (D147,
        // `mayRaiseFor`). A shared project is a worked project: quoting on it is
        // the point of being on it; and a company of his own carries every job
        // on it, whoever created them.
        or(
          eq(companies.repId, user.id),
          eq(projects.repId, user.id),
          onProjectSql(user, sql`projects.id`),
        ),
        isNull(companies.archivedAt),
        isNull(projects.archivedAt),
        isNull(projects.lostAt),
      ),
    )
    .orderBy(asc(companies.name), asc(projects.name));

  return rows.map((row) => ({
    value: projectOptionValue(row.id, row.companyId),
    label: row.name,
    hint: row.companyName,
  }));
}

/**
 * The customers and the jobs the Quotations screen's own button may raise on
 * (P12-9), in one read.
 *
 * Every quotation names a project (D94), so the customers are the customers of
 * the projects he may raise on — derived here rather than asked for again, which
 * also means the two lists cannot disagree about what he is allowed to do.
 */
export async function quotationTargets(user: SessionUser): Promise<QuotationTargets> {
  const projects = await projectOptions(user);
  return { companies: companiesOf(projects), projects };
}

/**
 * The quotations this person may still send against.
 *
 * Issued, the live revision (D36 — paper that has gone out is not dispatched
 * against after it has been replaced), and with at least one line that has
 * something left on it. "Left" counts waiting requests as spent, the same as
 * everywhere else (D12), so a rep cannot raise a second dispatch for stock the
 * first one already claimed.
 */
export async function dispatchableQuotationOptions(user: SessionUser): Promise<PickerOption[]> {
  if (!sells(user.role) || !holdsFloor(user.role) || user.viewedBy) return [];

  const rows = await db
    .select({
      id: quotations.id,
      number: quotations.number,
      revision: quotations.revision,
      companyName: companies.name,
      projectName: projects.name,
    })
    .from(quotations)
    .innerJoin(companies, eq(companies.id, quotations.companyId))
    .leftJoin(projects, eq(projects.id, quotations.projectId))
    .where(
      and(
        /*
         * `mayRaiseFor` again, in SQL, and asked of the same three things the
         * quotation drawer asks it of: the customer is his, the job is his, or
         * the job is one he was put on — two reps working one project send
         * against each other's quotations, which is what sharing the job means
         * (D147). It asked whether HE raised the paper, which is neither the
         * drawer's question nor the action's: a quotation another rep raised on
         * his own customer was offered on the drawer and withheld from the
         * screen built to raise dispatches (§5 #177). A quotation with no
         * project is the company's own stock and only its rep sends against it,
         * which falls out of the left join: `projects.rep_id` is null and the
         * first clause is the only one that can be true.
         */
        or(
          eq(companies.repId, user.id),
          eq(projects.repId, user.id),
          onProjectSql(user, sql`quotations.project_id`),
        ),
        // The same two states the action allows and the drawer offers, said
        // once (§5 #166). This read `issued` alone, so a quotation the customer
        // had accepted vanished from the picker on the screen whose whole job
        // is raising dispatches — while the drawer one click away still offered
        // it, and the action behind both would have taken it.
        inArray(quotations.status, DISPATCHABLE),
        isLatestRevisionSql(),
        sql`exists (
          select 1
            from quotation_items qi
           where qi.quotation_id = quotations.id
             and qi.qty > ${committedQtySql(sql`qi.id`)}
        )`,
      ),
    )
    .orderBy(desc(quotations.number));

  return rows.map((row) => ({
    value: row.id,
    label: quotationLabel(row.number, row.revision),
    hint: row.projectName ?? row.companyName,
  }));
}

/**
 * The people a company can be handed to, or filed onto (P8.9, P12-7).
 *
 * Everybody active whose floor a company may sit on, minus whoever has it now —
 * handing a company to the person already holding it is not a move, and an
 * option that does nothing is one more thing to read past.
 *
 * `exceptId` is null where there is nobody to leave out: a lead is filed onto
 * somebody's floor rather than moved off one, and §3 says it may go "to a
 * chosen rep, or to a member of the marketing team" — which includes the person
 * filing it, who then has it and nobody to tell.
 *
 * The role is the hint rather than part of the name, so "Faisal" stays one
 * value and the two never end up either side of a separator (D46).
 */
export async function floorHolderOptions(
  exceptId: string | null,
  roleName: (role: Role) => string,
): Promise<PickerOption[]> {
  const locale = await getLocale();
  const rows = await db
    .select({ id: users.id, name: personName(locale), role: users.role })
    .from(users)
    .where(eq(users.active, true))
    .orderBy(asc(personName(locale)));

  return rows
    .filter((row) => row.id !== exceptId && holdsFloor(row.role as Role))
    .map((row) => ({ value: row.id, label: row.name, hint: roleName(row.role as Role) }));
}
