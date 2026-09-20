"use server";

/**
 * The sales manager's answer to a request to archive something (P14 14.8).
 *
 * Two actions rather than one with a flag, the way the dispatch chain already
 * answers a load: approving takes nothing but the request, and refusing takes a
 * reason it cannot happen without (S53). One action with an optional argument
 * would be one action that archives a record when the reason fails to arrive.
 *
 * The record's own gate is not asked here. Who may archive a company is a
 * question about whose company it is; this is a question about who answers the
 * office's requests, and the founder's answer was the sales manager (D212).
 */

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { answerArchiveRequest } from "@/lib/archive-requests";
import { NotAllowed, refusalKey, requireActor } from "@/lib/authz";
import { answersArchiveRequests } from "@/lib/floor";
import type { ActionResult, SessionUser } from "@/lib/types";

async function guard<T>(
  run: (actor: SessionUser) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  const t = await getTranslations("common");
  try {
    return await run(await requireActor());
  } catch (error) {
    if (error instanceof NotAllowed) return { ok: false, error: t(refusalKey(error)) };
    console.error("archive request action failed", error);
    return { ok: false, error: t("somethingWrong") };
  }
}

function revalidateFloor(): void {
  revalidatePath("/[locale]", "page");
  revalidatePath("/[locale]/companies", "page");
  revalidatePath("/[locale]/projects", "page");
  revalidatePath("/[locale]/team", "page");
}

/** Yes: the record goes off the floor now, under the reason it was asked with. */
export async function approveArchiveAction(requestId: unknown): Promise<ActionResult> {
  return guard(async (actor) => {
    const tc = await getTranslations("common");
    const t = await getTranslations("errors");
    if (!answersArchiveRequests(actor)) throw new NotAllowed();

    const id = z.uuid().safeParse(requestId);
    if (!id.success) return { ok: false, error: tc("invalid") };

    const outcome = await answerArchiveRequest({ id: id.data, actor });
    if (outcome === "gone") return { ok: false, error: t("archiveRecordGone") };
    if (outcome === "answered") return { ok: false, error: t("archiveAnswered") };

    revalidateFloor();
    return { ok: true };
  });
}

/** No, and why — the sentence goes back to whoever asked, who may ask again. */
export async function refuseArchiveAction(
  requestId: unknown,
  reason: unknown,
): Promise<ActionResult> {
  return guard(async (actor) => {
    const tc = await getTranslations("common");
    const t = await getTranslations("errors");
    if (!answersArchiveRequests(actor)) throw new NotAllowed();

    const id = z.uuid().safeParse(requestId);
    if (!id.success) return { ok: false, error: tc("invalid") };
    const why = z.string().trim().min(1).max(500).safeParse(reason);
    if (!why.success) {
      const sentence = t("reasonRequired");
      return { ok: false, error: sentence, fieldErrors: { reason: sentence } };
    }

    const outcome = await answerArchiveRequest({
      id: id.data,
      actor,
      refuseReason: why.data,
    });
    if (outcome === "gone") return { ok: false, error: t("archiveRecordGone") };
    if (outcome === "answered") return { ok: false, error: t("archiveAnswered") };

    revalidateFloor();
    return { ok: true };
  });
}
