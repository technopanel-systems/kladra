/**
 * The admin looking at the app as somebody else (SPEC §3, P8).
 *
 * Jerom asked for it so he can check and test a screen he will never see
 * himself — the coordinator's queue, a rep's day — without keeping four
 * passwords. It is impersonation, so it is built to three rules and they are
 * all here rather than spread across the screens that obey them:
 *
 * 1. **Only an admin may start it, and the check is on the REAL session.** The
 *    cookie names who is being viewed and nothing else; every request re-reads
 *    the signed-in user from the session and refuses to apply the cookie unless
 *    that person is an admin. A forged cookie changes nothing.
 * 2. **Nothing may be written while viewing.** Not "no buttons are shown" —
 *    every server action refuses, in `requireActor`, which is the one door all
 *    of them go through. A screen that forgot to hide a control still cannot
 *    do anything.
 * 3. **It is never invisible.** The banner is in the app layout, on every
 *    screen, and says whose eyes these are and that nothing can be changed.
 *
 * Pure, so `tests/view-as.spec.ts` can ask the rules directly.
 */
import type { Role } from "@/lib/types";

export const VIEW_AS_COOKIE = "kladra-view-as";

/** Who may look through somebody else's eyes: the admin, and nobody else. */
export function mayViewAs(realRole: Role): boolean {
  return realRole === "admin";
}

/**
 * Whether the cookie should be honoured at all.
 *
 * Separate from `mayViewAs` because two things have to be true and only one of
 * them is about the role: an admin viewing HIMSELF is not viewing anybody, and
 * treating it as viewing would put a banner on his own screen and stop him
 * working.
 */
export function shouldView(realRole: Role, realId: string, wanted: string | undefined): boolean {
  return Boolean(wanted) && wanted !== realId && mayViewAs(realRole);
}
