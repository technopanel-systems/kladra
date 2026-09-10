"use server";

/**
 * Remember what this person chose to look at (SPEC §3, D164).
 *
 * One write, called from an effect after the screen has already changed, so
 * nothing on screen waits for it. That was the whole argument for the cookie it
 * replaces — "a round trip would make pressing the switch slower than pressing
 * it does anything" — and the argument was about the wrong moment: the press
 * navigates, the new page renders, and only then does the browser mention what
 * it is looking at. The cost of this failing is one click next time.
 *
 * `requireActor`, not `requireUser`: an admin viewing as somebody sees that
 * person's screens, and if he pressed Board there he would be choosing on
 * another man's behalf. `requireActor` refuses a viewed session outright, and
 * the refusal is silent here — there is no sentence to show for a preference
 * nobody asked to save.
 *
 * The one action in the app that does not answer with an `ActionResult`, for
 * that reason: an ActionResult's `error` is a sentence for a person to read, and
 * fetching a translation of a sentence nobody will ever be shown is a round trip
 * spent on nothing. A real fault still throws, so it reaches the server log the
 * way any other does; the caller catches, because an unhandled rejection from a
 * server action reaches the nearest error boundary (D132).
 */

import { z } from "zod";
import { db } from "@/db";
import { CHOICE_KINDS, screenChoices } from "@/db/schema";
import { NotAllowed, requireActor } from "@/lib/authz";
import type { SessionUser } from "@/lib/types";

/**
 * The word is not trusted, only bounded. Each reader parses its own — an
 * unknown view falls back to the list — so this refuses shapes rather than
 * vocabulary, and a screen that gains a third view needs no migration and no
 * change here.
 */
const schema = z.object({
  kind: z.enum(CHOICE_KINDS),
  screen: z
    .string()
    .regex(/^[a-z][a-z-]{0,30}$/),
  choice: z
    .string()
    .regex(/^[a-z][a-z-]{0,30}$/),
});

export async function rememberChoiceAction(
  kind: string,
  screen: string,
  choice: string,
): Promise<void> {
  let actor: SessionUser;
  try {
    actor = await requireActor();
  } catch (error) {
    // Signed out, or reading as somebody else. Neither has a preference to
    // save, and neither is worth a sentence on a screen that has already
    // changed. Anything else is a real fault and is left to throw.
    if (error instanceof NotAllowed) return;
    throw error;
  }

  const parsed = schema.safeParse({ kind, screen, choice });
  if (!parsed.success) return;

  await db
    .insert(screenChoices)
    .values({ userId: actor.id, ...parsed.data })
    .onConflictDoUpdate({
      target: [screenChoices.userId, screenChoices.kind, screenChoices.screen],
      // `$onUpdate` belongs to `db.update` and never fires on a conflict, so
      // the stamp is set by hand — otherwise the row would say it was last
      // touched on the day the person first opened the screen.
      set: { choice: parsed.data.choice, updatedAt: new Date() },
    });
}
