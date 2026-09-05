"use server";

/**
 * The one write the daily report has (SPEC D55, D58).
 *
 * Everything else on that screen is assembled from records that already exist,
 * so there is nothing else to save: one box of text, against one Riyadh day,
 * belonging to the person who is signed in. Not to a person the form names —
 * a report is written by whoever wrote it, and a field for "whose day is this"
 * would be a field for writing somebody else's.
 */

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { db } from "@/db";
import { auditLog } from "@/db/schema";
import { NotAllowed, requireActor } from "@/lib/authz";
import { liveAudienceFor, notifyLive } from "@/lib/live";
import { parseDay } from "@/lib/dates";
import { REPORTING_ROLES } from "@/lib/floor";
import { mayWriteFor } from "@/lib/reports";
import type { ActionResult } from "@/lib/types";

const dayString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((day) => {
    const { y, m, d } = parseDay(day);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  });

const schema = z.object({
  day: dayString,
  /** One box. Long enough for three sentences, short enough to stay one minute. */
  note: z.string().trim().min(1).max(2000),
});

/**
 * Write or rewrite one day's line.
 *
 * Saving twice on the same day replaces it rather than adding a second, which is
 * what the unique index on (user_id, day) says and what a person means when they
 * press Save again.
 */
export async function saveReportAction(day: unknown, note: unknown): Promise<ActionResult> {
  const tc = await getTranslations("common");
  const t = await getTranslations("reports");

  try {
    const actor = await requireActor(...REPORTING_ROLES);

    const parsed = schema.safeParse({ day, note });
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.path[0] === "note" ? t("sayWhat") : tc("invalid") };
    }

    // Today and the last working day, then it closes (D58). The check is here
    // and not only on the screen, because the screen is not the only way in.
    if (!(await mayWriteFor(parsed.data.day))) return { ok: false, error: t("dayClosed") };

    // Everybody, because everybody reads this screen (D56): the two roles that
    // always watch, plus the three that write. One list, so a report cannot
    // arrive on one person's screen and not on another's.
    const audience = await liveAudienceFor(actor.id, actor.id, [...REPORTING_ROLES]);

    await db.transaction(async (tx) => {
      const saved = await tx.execute<{ id: string }>(sql`
        insert into daily_reports (user_id, day, note)
        values (${actor.id}::uuid, ${parsed.data.day}::date, ${parsed.data.note})
        on conflict (user_id, day) do update
          set note = excluded.note, updated_at = now()
        returning id
      `);

      // The row's own id, like every other audit row — a rewrite lands on the
      // same report, so the log reads as one record changed rather than two
      // written. Which day it was about is in the details.
      const id = saved.rows[0]?.id ?? "";

      await tx.insert(auditLog).values({
        userId: actor.id,
        action: "report.write",
        recordType: "daily_report",
        recordId: id,
        details: { day: parsed.data.day },
      });

      await notifyLive(tx, audience, { type: "report", id, day: parsed.data.day });
    });

    revalidatePath("/[locale]/reports", "page");
    revalidatePath("/[locale]/day", "page");
    return { ok: true };
  } catch (error) {
    if (error instanceof NotAllowed) return { ok: false, error: tc("notAllowed") };
    console.error("report action failed", error);
    return { ok: false, error: tc("somethingWrong") };
  }
}
