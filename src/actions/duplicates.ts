"use server";

/**
 * The manager's three answers to "these two are the same customer" (P12-8).
 *
 * S22 in FACET's spec, brought forward because it is the half of S15 nothing in
 * Kladra had: a company is always created even when it looks like a duplicate,
 * and until this box that was the end of it — two reps rang one customer for
 * ever and nobody was told. The detector raises a flag on the number
 * (src/lib/duplicates.ts); this is what happens to it.
 *
 * **Not the same company.** Two firms with one number between them, which
 * happens: a receptionist, a father and a son, one office holding two trades.
 * Remembered for ever, so the pair is never raised again.
 *
 * **Keep this one.** The other's people and work move onto it, and it stays
 * behind as a tombstone pointing at the record that continues. The rep who
 * loses it gains nothing — that is the difference between this answer and the
 * next one, and it is the whole of the difference.
 *
 * **Keep this one, and share it.** The same fold, and every rep who held the
 * folded record goes onto the survivor's share list. Access to the customer,
 * never ownership of the deals (§3, D147): a share is already exactly that, so
 * this answer is one more row in a table that already exists and no new idea.
 *
 * Who may answer is `mayHandOver` and not a fourth permission beside it. A fold
 * moves a customer from one floor to another, which is what a hand-over is, and
 * §3 gave that to the sales manager. A permission with a second name is a
 * permission with two answers the first time one of them is edited.
 *
 * It writes to `companies` although src/actions/companies.ts owns that table's
 * screens: a fold is one act — contacts, projects, the log, the quotations, the
 * shares and the tombstone — and half a transaction in each of two files is not
 * a smaller thing to hold in the head than one whole one here.
 */

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { db, type Tx } from "@/db";
import { auditLog, companies, duplicateFlags, DUPLICATE_RULINGS } from "@/db/schema";
import { NotAllowed, refusalKey, requireActor } from "@/lib/authz";
import { foldCompany } from "@/lib/duplicates";
import { mayHandOver } from "@/lib/floor";
import { holdDuplicateFlag } from "@/lib/hold";
import { liveAudienceForCompany, notifyLive } from "@/lib/live";
import type { ActionResult, SessionUser } from "@/lib/types";

async function guard<T>(run: (actor: SessionUser) => Promise<ActionResult<T>>) {
  const t = await getTranslations("common");
  try {
    return await run(await requireActor());
  } catch (error) {
    if (error instanceof NotAllowed) return { ok: false as const, error: t(refusalKey(error)) };
    console.error("duplicates action failed", error);
    return { ok: false as const, error: t("somethingWrong") };
  }
}

const ruleInput = z.object({
  flagId: z.uuid(),
  ruling: z.enum(DUPLICATE_RULINGS),
  /** Which record continues. Required by the two rulings that fold. */
  survivorId: z.uuid().optional(),
});

/**
 * Rule on one pair.
 *
 * The flag is held first (D85, src/lib/hold.ts). Two managers on one pair would
 * otherwise each read `open`, each fold, and the second would move a customer
 * onto a record that had already stopped existing — the shape every transition
 * in this app has taken a lock against since P11A.
 */
export async function ruleDuplicateAction(
  flagId: unknown,
  ruling: unknown,
  survivorId?: unknown,
): Promise<ActionResult> {
  return guard(async (actor) => {
    const tc = await getTranslations("common");
    const te = await getTranslations("errors");

    const parsed = ruleInput.safeParse({ flagId, ruling, survivorId: survivorId ?? undefined });
    if (!parsed.success) return { ok: false, error: tc("invalid") };
    if (!mayHandOver(actor)) throw new NotAllowed();

    const folds = parsed.data.ruling !== "notDuplicate";
    if (folds && !parsed.data.survivorId) return { ok: false, error: te("duplicateWhichOne") };

    const outcome = await db.transaction(async (tx) => {
      const flag = await holdDuplicateFlag(tx, parsed.data.flagId);
      if (!flag) return "gone" as const;
      // Somebody answered it in the other tab. His answer stands; saying so is
      // better than performing a second fold on top of the first.
      if (flag.status !== "open") return "answered" as const;

      const survivorId = parsed.data.survivorId ?? null;
      if (survivorId && survivorId !== flag.companyId && survivorId !== flag.otherId) {
        return "gone" as const;
      }
      const foldedId = survivorId === flag.companyId ? flag.otherId : flag.companyId;

      const names = await namesOf(tx, [flag.companyId, flag.otherId]);

      if (survivorId) {
        await foldCompany(tx, {
          survivorId,
          foldedId,
          share: parsed.data.ruling === "keptAndShared",
          actorId: actor.id,
        });
      }

      await tx
        .update(duplicateFlags)
        .set({
          status: parsed.data.ruling,
          survivorId,
          ruledBy: actor.id,
          ruledAt: new Date(),
        })
        .where(eq(duplicateFlags.id, parsed.data.flagId));

      await tx.insert(auditLog).values({
        userId: actor.id,
        action: "company.duplicateRuled",
        recordType: "company",
        // The record the ruling is ABOUT is the one that continues; where
        // nothing continues, the one that raised the flag.
        recordId: survivorId ?? flag.companyId,
        details: {
          ruling: parsed.data.ruling,
          kept: survivorId ?? null,
          folded: survivorId ? foldedId : null,
          names: [names.get(flag.companyId) ?? "", names.get(flag.otherId) ?? ""],
        },
      });

      const audience = new Set([
        ...(await liveAudienceForCompany(flag.companyId, actor.id)),
        ...(await liveAudienceForCompany(flag.otherId, actor.id)),
      ]);
      await notifyLive(tx, [...audience], { type: "company", id: survivorId ?? flag.companyId });
      return "ok" as const;
    });

    if (outcome === "gone") return { ok: false, error: te("companyNotFound") };
    if (outcome === "answered") return { ok: false, error: te("duplicateAnswered") };

    revalidatePath("/[locale]/duplicates", "page");
    revalidatePath("/[locale]/companies", "page");
    revalidatePath("/[locale]/projects", "page");
    revalidatePath("/[locale]/team", "page");
    return { ok: true };
  });
}

/**
 * Both names in one read, for the audit row.
 *
 * The audit row is the one place in this app that keeps a copy of a name on
 * purpose: it is the record of what was decided (S55), and it has to still read
 * six months later when one of the two is a tombstone somebody has since
 * renamed. Every SCREEN joins for the name instead (D68, D110).
 */
async function namesOf(tx: Tx, ids: readonly string[]): Promise<Map<string, string>> {
  const rows = await tx
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .where(sql`${companies.id} in (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)})`);
  return new Map(rows.map((row) => [row.id, row.name]));
}
