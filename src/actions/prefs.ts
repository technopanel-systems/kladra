"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { db } from "@/db";
import { auditLog, users } from "@/db/schema";
import { getPathname } from "@/i18n/navigation";
import { NotAllowed, refusalKey, requireActor } from "@/lib/authz";
import { THEME_COOKIE } from "@/lib/theme";
import type { ActionResult, SessionUser } from "@/lib/types";

/**
 * The two preferences in the user menu (SPEC D16): theme is saved per browser
 * in a cookie the root layout reads on the server, so the palette is in the
 * first byte of HTML; language is saved per user, because it follows the
 * person to whichever machine they sign in on.
 */

const themeSchema = z.enum(["dark", "light"]);
const localeSchema = z.enum(["en", "ar"]);

/**
 * Where to land after the language changes. It is a locale-less pathname from
 * `usePathname()` — a server action cannot see the URL it was called from.
 * Anything that could leave the app (a scheme, a host, a protocol-relative
 * path) is refused rather than followed.
 */
const pathnameSchema = z
  .string()
  .max(512)
  .regex(/^\/(?!\/)[A-Za-z0-9\-._~/]*$/);

const YEAR = 60 * 60 * 24 * 365;

/**
 * The person, or the sentence for why there is none.
 *
 * A session that ended while the menu sat open is the commonest failure here,
 * and it says so rather than "you are not allowed to do that" (D135) — the
 * menu shows this sentence in a toast, and an accusation is the wrong words
 * for a sign-in that simply ran out.
 */
async function actorOrRefusal(): Promise<
  { actor: SessionUser; refusal?: never } | { actor?: never; refusal: string }
> {
  const t = await getTranslations("common");
  try {
    return { actor: await requireActor() };
  } catch (error) {
    if (error instanceof NotAllowed) return { refusal: t(refusalKey(error)) };
    return { refusal: t("somethingWrong") };
  }
}

/** Dark or light, for this browser. The root layout reads the cookie. */
export async function setThemeAction(theme: unknown): Promise<ActionResult> {
  const t = await getTranslations("common");
  const { actor, refusal } = await actorOrRefusal();
  if (!actor) return { ok: false, error: refusal };

  const parsed = themeSchema.safeParse(theme);
  if (!parsed.success) return { ok: false, error: t("invalid") };

  const store = await cookies();
  store.set(THEME_COOKIE, parsed.data, {
    path: "/",
    maxAge: YEAR,
    sameSite: "lax",
    // Readable by the browser on purpose: the offline splash (public/offline.html)
    // has no server to ask and reads this cookie to paint the right theme
    // (§5 #53). There is nothing in it to protect.
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * English or Arabic, for this person. The audit row is written with the update,
 * in one transaction, so the log never claims a change the database did not
 * take (SPEC S55).
 *
 * It returns the target href instead of redirecting, and the caller performs a
 * FULL document navigation. `redirect()` here would be a soft navigation, and
 * the root layout — the only place that can render `<html lang dir>` — is
 * never re-rendered on one. The URL and the content changed while `dir` kept
 * the old value, so English sentences rendered inside a right-to-left
 * container and bidi moved the full stop to the front of the line. A real page
 * load also delivers the correct direction in the first byte, with no flash.
 * (The theme toggle above does not have this problem: `revalidatePath("/",
 * "layout")` re-renders the root layout in place.)
 */
export async function setLocaleAction(
  locale: unknown,
  pathname: unknown,
): Promise<ActionResult<{ href: string }>> {
  const t = await getTranslations("common");
  const { actor, refusal } = await actorOrRefusal();
  if (!actor) return { ok: false, error: refusal };

  const wanted = localeSchema.safeParse(locale);
  const target = pathnameSchema.safeParse(pathname);
  if (!wanted.success || !target.success) return { ok: false, error: t("invalid") };

  if (wanted.data !== actor.locale) {
    await db.transaction(async (tx) => {
      await tx.update(users).set({ locale: wanted.data }).where(eq(users.id, actor.id));
      await tx.insert(auditLog).values({
        userId: actor.id,
        action: "user.locale",
        recordType: "user",
        recordId: actor.id,
        details: { locale: wanted.data },
      });
    });
  }

  return { ok: true, data: { href: getPathname({ href: target.data, locale: wanted.data }) } };
}
