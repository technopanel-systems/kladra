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
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { companies, projects, quotations, users } from "@/db/schema";
import { committedQtySql } from "@/lib/dispatches";
import { holdsFloor, sells } from "@/lib/floor";
import { quotationLabel } from "@/lib/labels";
import type { PickerOption } from "@/lib/picker-option";
import { isLatestRevisionSql } from "@/lib/quotations";
import type { Role, SessionUser } from "@/lib/types";

export type { PickerOption };

/** The companies this person may add a project to: their own, not archived. */
export async function companyOptions(user: SessionUser): Promise<PickerOption[]> {
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
 */
export async function projectOptions(user: SessionUser): Promise<PickerOption[]> {
  // Nothing to offer somebody who does not quote: the Quotations screen then
  // draws no button at all, rather than one that would be refused (P8.9).
  if (!sells(user.role)) return [];

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
        eq(companies.repId, user.id),
        isNull(companies.archivedAt),
        isNull(projects.archivedAt),
        isNull(projects.lostAt),
      ),
    )
    .orderBy(asc(companies.name), asc(projects.name));

  return rows.map((row) => ({
    value: `${row.id}:${row.companyId}`,
    label: row.name,
    hint: row.companyName,
  }));
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
  if (!sells(user.role)) return [];

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
        eq(companies.repId, user.id),
        eq(quotations.status, "issued"),
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
 * The people a company can be handed to (P8.9).
 *
 * Everybody active whose floor a company may sit on, minus whoever has it now —
 * handing a company to the person already holding it is not a move, and an
 * option that does nothing is one more thing to read past.
 *
 * The role is the hint rather than part of the name, so "Faisal" stays one
 * value and the two never end up either side of a separator (D46).
 */
export async function floorHolderOptions(
  exceptId: string,
  roleName: (role: Role) => string,
): Promise<PickerOption[]> {
  const rows = await db
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(eq(users.active, true))
    .orderBy(asc(users.name));

  return rows
    .filter((row) => row.id !== exceptId && holdsFloor(row.role as Role))
    .map((row) => ({ value: row.id, label: row.name, hint: roleName(row.role as Role) }));
}
