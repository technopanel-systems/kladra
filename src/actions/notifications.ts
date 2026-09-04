"use server";

/**
 * Marking notifications read (SPEC S52: a reminder is cleared by doing the
 * work, never by dismissing it).
 *
 * That rule is about REMINDERS — the follow-up strip, which no button here can
 * touch and which only a logged visit clears. A notification is different: it
 * is a notice that something happened, and once it has been read it has done
 * its whole job. Leaving it bold forever would train everybody to ignore the
 * bell, which is the same failure by a longer road.
 */

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { db } from "@/db";
import { requireActor } from "@/lib/authz";
import { markNotificationsRead } from "@/lib/notify";
import type { ActionResult } from "@/lib/types";

/**
 * Marks one notification read, or all of them.
 *
 * The reader is always the actor: there is no "whose" parameter, so no request
 * can mark somebody else's. `markNotificationsRead` re-announces the count on
 * the live channel, so the bell drops in every tab this person has open.
 */
export async function markReadAction(
  notificationId?: string,
): Promise<ActionResult<{ unread: number }>> {
  const t = await getTranslations("common");
  try {
    const actor = await requireActor();
    const id = notificationId ? z.uuid().safeParse(notificationId) : null;
    if (id && !id.success) return { ok: false, error: t("invalid") };

    const unread = await db.transaction((tx) =>
      markNotificationsRead(tx, actor.id, id?.data),
    );

    revalidatePath("/[locale]/notifications", "page");
    return { ok: true, data: { unread } };
  } catch {
    return { ok: false, error: t("somethingWrong") };
  }
}
