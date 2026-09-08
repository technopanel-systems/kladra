"use server";

import { and, eq, inArray } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  auditLog,
  companies,
  companyShares,
  projectShares,
  projects,
  users,
} from "@/db/schema";
import { NotAllowed, refusalKey, requireActor } from "@/lib/authz";
import { holdsFloor, mayShare } from "@/lib/floor";
import { liveAudienceFor, notifyLive } from "@/lib/live";
import { createNotification } from "@/lib/notify";
import type { ActionResult, Role, SessionUser } from "@/lib/types";
import { sharersOfCompany } from "@/lib/visibility";

/**
 * Putting somebody else on a customer, and taking him off again (SPEC §3, D147).
 *
 * Two levels and two verbs, and the difference between them is the whole rule.
 * Sharing a COMPANY says "look at this with me": he reads all of it, keeps his
 * own contacts on it, and works none of it. Sharing a PROJECT says "this one is
 * ours": he logs against it, reports on it and raises quotations and dispatches
 * on it, and what he raises is his own.
 *
 * Neither is a handover. Nothing moves, the metres stay where they were, and
 * the person who granted it keeps everything he had — which is why its own
 * permission says so (`mayShare`) rather than borrowing the handover's.
 */
async function guard<T>(
  run: (actor: SessionUser) => Promise<ActionResult<T>>,
  ...roles: Role[]
): Promise<ActionResult<T>> {
  const t = await getTranslations("common");
  try {
    return await run(await requireActor(...roles));
  } catch (error) {
    if (error instanceof NotAllowed) return { ok: false, error: t(refusalKey(error)) };
    console.error("shares action failed", error);
    return { ok: false, error: t("somethingWrong") };
  }
}

function revalidateFloor(): void {
  revalidatePath("/[locale]/companies", "page");
  revalidatePath("/[locale]/projects", "page");
  revalidatePath("/[locale]/day", "page");
}

/** Both ids, or the two sentences that say which one is wrong. */
async function twoIds(
  subjectId: unknown,
  userId: unknown,
): Promise<{ subject: string; user: string } | string> {
  const tc = await getTranslations("common");
  const t = await getTranslations("errors");
  const subject = z.uuid().safeParse(subjectId);
  if (!subject.success) return tc("invalid");
  const user = z.uuid().safeParse(userId);
  // The same sentence the handover uses: the confirm button is live before the
  // picker has been touched, so "you have not said who" is the line a person
  // actually hits.
  if (!user.success) return t("shareWho");
  return { subject: subject.data, user: user.data };
}

/** Somebody a customer can be shared with: active, and holding a floor. */
async function receiver(userId: string): Promise<{ id: string; role: Role } | null> {
  const [row] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.active, true)))
    .limit(1);
  return row && holdsFloor(row.role) ? row : null;
}

export async function shareCompanyAction(
  companyId: unknown,
  userId: unknown,
): Promise<ActionResult> {
  return guard(async (actor) => {
    const t = await getTranslations("errors");
    const ids = await twoIds(companyId, userId);
    if (typeof ids === "string") return { ok: false, error: ids };

    const [company] = await db
      .select({ id: companies.id, name: companies.name, repId: companies.repId })
      .from(companies)
      .where(eq(companies.id, ids.subject))
      .limit(1);
    if (!company) return { ok: false, error: t("companyNotFound") };
    if (!mayShare(actor, company.repId)) throw new NotAllowed();

    const target = await receiver(ids.user);
    if (!target) return { ok: false, error: t("shareWho") };
    // Sharing a company with the rep whose company it is would be a permission
    // he already has, written down twice.
    if (target.id === company.repId) return { ok: false, error: t("shareOwner") };

    await db.transaction(async (tx) => {
      // Pressing it twice is one share, not an error: the second press means
      // the same thing as the first.
      await tx
        .insert(companyShares)
        .values({ companyId: company.id, userId: target.id, grantedBy: actor.id })
        .onConflictDoNothing();

      await tx.insert(auditLog).values({
        userId: actor.id,
        action: "companyShare.grant",
        recordType: "companyShare",
        recordId: company.id,
        details: { name: company.name, to: target.id },
      });

      if (target.id !== actor.id) {
        await createNotification(tx, {
          userId: target.id,
          kind: "companyShared",
          params: { label: company.name, repId: actor.id },
          link: `/companies?open=${company.id}`,
          subject: { type: "company", id: company.id },
        });
      }

      await notifyLive(
        tx,
        await liveAudienceFor(company.repId, actor.id, [], [
          ...(await sharersOfCompany(company.id)),
          target.id,
        ]),
        { type: "company", id: company.id },
      );
    });

    revalidateFloor();
    return { ok: true, data: undefined };
  });
}

export async function unshareCompanyAction(
  companyId: unknown,
  userId: unknown,
): Promise<ActionResult> {
  return guard(async (actor) => {
    const t = await getTranslations("errors");
    const ids = await twoIds(companyId, userId);
    if (typeof ids === "string") return { ok: false, error: ids };

    const [company] = await db
      .select({ id: companies.id, name: companies.name, repId: companies.repId })
      .from(companies)
      .where(eq(companies.id, ids.subject))
      .limit(1);
    if (!company) return { ok: false, error: t("companyNotFound") };
    // Whoever may grant it may take it back, and so may the person it was
    // granted to: leaving a customer somebody put you on is nobody else's
    // decision (D147).
    if (!mayShare(actor, company.repId) && actor.id !== ids.user) throw new NotAllowed();

    const before = await sharersOfCompany(company.id);

    await db.transaction(async (tx) => {
      await tx
        .delete(companyShares)
        .where(
          and(eq(companyShares.companyId, company.id), eq(companyShares.userId, ids.user)),
        );

      // Every project under it goes with it. A rep who can no longer see the
      // customer cannot be left holding the work: the share he keeps would be a
      // permission pointing at a company he cannot open, which is the row a
      // screen has no way to draw.
      await tx.delete(projectShares).where(
        and(
          eq(projectShares.userId, ids.user),
          inArray(
            projectShares.projectId,
            tx.select({ id: projects.id }).from(projects).where(eq(projects.companyId, company.id)),
          ),
        ),
      );

      await tx.insert(auditLog).values({
        userId: actor.id,
        action: "companyShare.revoke",
        recordType: "companyShare",
        recordId: company.id,
        details: { name: company.name, from: ids.user },
      });

      await notifyLive(
        tx,
        await liveAudienceFor(company.repId, actor.id, [], [...before, ids.user]),
        { type: "company", id: company.id },
      );
    });

    revalidateFloor();
    return { ok: true, data: undefined };
  });
}

export async function shareProjectAction(
  projectId: unknown,
  userId: unknown,
): Promise<ActionResult> {
  return guard(async (actor) => {
    const t = await getTranslations("errors");
    const ids = await twoIds(projectId, userId);
    if (typeof ids === "string") return { ok: false, error: ids };

    const [project] = await db
      .select({
        id: projects.id,
        name: projects.name,
        repId: projects.repId,
        companyId: projects.companyId,
        companyRepId: companies.repId,
      })
      .from(projects)
      .innerJoin(companies, eq(companies.id, projects.companyId))
      .where(eq(projects.id, ids.subject))
      .limit(1);
    if (!project) return { ok: false, error: t("projectNotFound") };
    if (!mayShare(actor, project.repId)) throw new NotAllowed();

    const target = await receiver(ids.user);
    if (!target) return { ok: false, error: t("shareWho") };
    if (target.id === project.repId) return { ok: false, error: t("shareOwner") };

    await db.transaction(async (tx) => {
      // Working a job means reading the customer it is for. Somebody put on a
      // project he cannot see the company of would open nothing, so the company
      // share comes with it rather than being a second thing to remember.
      await tx
        .insert(companyShares)
        .values({ companyId: project.companyId, userId: target.id, grantedBy: actor.id })
        .onConflictDoNothing();
      await tx
        .insert(projectShares)
        .values({ projectId: project.id, userId: target.id, grantedBy: actor.id })
        .onConflictDoNothing();

      await tx.insert(auditLog).values({
        userId: actor.id,
        action: "projectShare.grant",
        recordType: "projectShare",
        recordId: project.id,
        details: { name: project.name, to: target.id },
      });

      if (target.id !== actor.id) {
        await createNotification(tx, {
          userId: target.id,
          kind: "projectShared",
          params: { label: project.name, repId: actor.id },
          link: `/projects?open=${project.id}`,
          subject: { type: "project", id: project.id },
        });
      }

      await notifyLive(
        tx,
        await liveAudienceFor(project.companyRepId, actor.id, [], [
          ...(await sharersOfCompany(project.companyId)),
          target.id,
        ]),
        { type: "project", id: project.id },
      );
    });

    revalidateFloor();
    return { ok: true, data: undefined };
  });
}

export async function unshareProjectAction(
  projectId: unknown,
  userId: unknown,
): Promise<ActionResult> {
  return guard(async (actor) => {
    const t = await getTranslations("errors");
    const ids = await twoIds(projectId, userId);
    if (typeof ids === "string") return { ok: false, error: ids };

    const [project] = await db
      .select({
        id: projects.id,
        name: projects.name,
        repId: projects.repId,
        companyId: projects.companyId,
        companyRepId: companies.repId,
      })
      .from(projects)
      .innerJoin(companies, eq(companies.id, projects.companyId))
      .where(eq(projects.id, ids.subject))
      .limit(1);
    if (!project) return { ok: false, error: t("projectNotFound") };
    if (!mayShare(actor, project.repId) && actor.id !== ids.user) throw new NotAllowed();

    await db.transaction(async (tx) => {
      await tx
        .delete(projectShares)
        .where(
          and(eq(projectShares.projectId, project.id), eq(projectShares.userId, ids.user)),
        );
      // The company share stays. He was reading the customer before this job
      // and taking that away is a second decision, made in its own place.

      await tx.insert(auditLog).values({
        userId: actor.id,
        action: "projectShare.revoke",
        recordType: "projectShare",
        recordId: project.id,
        details: { name: project.name, from: ids.user },
      });

      await notifyLive(
        tx,
        await liveAudienceFor(project.companyRepId, actor.id, [], [
          ...(await sharersOfCompany(project.companyId)),
          ids.user,
        ]),
        { type: "project", id: project.id },
      );
    });

    revalidateFloor();
    return { ok: true, data: undefined };
  });
}
