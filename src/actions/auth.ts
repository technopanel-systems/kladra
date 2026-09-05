"use server";

/**
 * Sign in and sign out. Both are the ONLY places a screen touches Auth.js:
 * everything else asks src/lib/authz.ts who is here.
 */

import { eq } from "drizzle-orm";
import { AuthError } from "next-auth";
import { cookies } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";

import { signIn, signOut } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { redirect } from "@/i18n/navigation";
import { homeFor } from "@/lib/authz";
import type { ActionResult } from "@/lib/types";
import { VIEW_AS_COOKIE } from "@/lib/view-as";

const credentials = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1),
});

/**
 * The login form's action (useActionState).
 *
 * Every failure — malformed email, unknown email, deactivated account, wrong
 * password — returns the same sentence. Saying which half was wrong turns the
 * form into a list of who works here (SPEC §2 S7).
 *
 * `error` is the finished sentence in the reader's language, not a message
 * key: the form renders `state.error` straight.
 */
export async function signInAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const t = await getTranslations("auth");
  const locale = await getLocale();
  const wrong: ActionResult = { ok: false, error: t("wrongCredentials") };

  const parsed = credentials.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return wrong;

  try {
    // `redirect: false` keeps the redirect ours: Auth.js's own would lose the
    // locale prefix and land everyone on the rep's home.
    await signIn("credentials", { ...parsed.data, redirect: false });
  } catch (error) {
    if (error instanceof AuthError) return wrong;
    throw error;
  }

  // Where each role lands is authz's one answer (homeFor). Read after sign-in
  // rather than from the session: the cookie was set on the response being
  // built, so `auth()` in this same request would still see the old one.
  const [row] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.email, parsed.data.email))
    .limit(1);
  if (!row) return wrong;

  // `return` only so TypeScript sees the function end; redirect() throws.
  return redirect({ href: homeFor(row.role), locale });
}

/**
 * Sign out. A form action, so it works with JavaScript off and needs no
 * client component: `<form action={signOutAction}><button …>`.
 *
 * `signOut` deletes the `sessions` row through the adapter before the cookie
 * is cleared — the session is gone everywhere, not just in this browser.
 */
export async function signOutAction(): Promise<void> {
  const locale = await getLocale();
  // Whoever signs in next on this browser starts as themselves. The cookie is
  // already harmless without an admin session behind it (src/lib/view-as.ts
  // checks the REAL role every request), but leaving it would put a banner in
  // front of the next admin for no reason.
  (await cookies()).delete(VIEW_AS_COOKIE);
  await signOut({ redirect: false });
  redirect({ href: "/login", locale });
}
