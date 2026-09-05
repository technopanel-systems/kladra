"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { db } from "@/db";
import { auditLog, users } from "@/db/schema";
import { NotAllowed, requireRealActor } from "@/lib/authz";
import type { ActionResult } from "@/lib/types";
import { mayViewAs, VIEW_AS_COOKIE } from "@/lib/view-as";

/**
 * Starting and stopping "view as" (SPEC §3, P8; src/lib/view-as.ts).
 *
 * Both ask for the REAL signed-in user, not the viewed one: an admin already
 * viewing has to be able to switch to somebody else or stop, and going through
 * the normal door would refuse him along with every other write.
 *
 * Both are audited. Looking at the app as another person is not a preference —
 * it is the one thing in Kladra where the name on a screen is not the name of
 * the person reading it, and S55 says every change is written down with who did
 * it. The row records the admin as the actor and the person viewed as the
 * record, so "who looked at Rawan's queue" is answerable.
 */

const idSchema = z.uuid();

export async function startViewingAction(
  _previous: ActionResult<undefined> | null,
  form: FormData,
): Promise<ActionResult<undefined>> {
  const t = await getTranslations("common");

  let admin;
  try {
    admin = await requireRealActor("admin");
  } catch (error) {
    if (error instanceof NotAllowed) return { ok: false, error: t("notAllowed") };
    throw error;
  }
  // Belt and braces: the role check above is the gate, and this is the rule it
  // is a copy of, said out loud where a reader can see it.
  if (!mayViewAs(admin.role)) return { ok: false, error: t("notAllowed") };

  const parsed = idSchema.safeParse(form.get("userId"));
  if (!parsed.success) return { ok: false, error: t("nothingYet") };

  const [target] = await db
    .select({ id: users.id, name: users.name, role: users.role, active: users.active })
    .from(users)
    .where(eq(users.id, parsed.data))
    .limit(1);

  // A deactivated account cannot sign in, so it cannot be looked through
  // either — otherwise this would be a way around deactivation.
  if (!target || !target.active) return { ok: false, error: t("nothingYet") };
  if (target.id === admin.id) return { ok: false, error: t("notAllowed") };

  await db.insert(auditLog).values({
    userId: admin.id,
    action: "view.start",
    recordType: "user",
    recordId: target.id,
    details: { name: target.name, role: target.role },
  });

  const jar = await cookies();
  jar.set(VIEW_AS_COOKIE, target.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    // The session's own life. It is deliberately not remembered any longer
    // than that: nobody should come back tomorrow still wearing somebody
    // else's screen.
    maxAge: 60 * 60 * 8,
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function stopViewingAction(): Promise<ActionResult<undefined>> {
  const t = await getTranslations("common");

  let admin;
  try {
    admin = await requireRealActor("admin");
  } catch (error) {
    if (error instanceof NotAllowed) return { ok: false, error: t("notAllowed") };
    throw error;
  }

  const jar = await cookies();
  const was = jar.get(VIEW_AS_COOKIE)?.value;
  jar.delete(VIEW_AS_COOKIE);

  if (was) {
    await db.insert(auditLog).values({
      userId: admin.id,
      action: "view.stop",
      recordType: "user",
      recordId: was,
      details: {},
    });
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * The same thing, shaped for a plain `<form action=…>`.
 *
 * A form action must return nothing. The banner's Stop button is deliberately a
 * form and not a fetch, so it works before hydration — the one control whose
 * job is getting out of an unusual state should not need JavaScript.
 */
export async function stopViewingFormAction(): Promise<void> {
  await stopViewingAction();
}

