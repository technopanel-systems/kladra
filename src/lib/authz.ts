import "server-only";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { seesAllRoles } from "./floor";
import { shouldView, VIEW_AS_COOKIE } from "./view-as";
import type { Role, SessionUser } from "./types";

/**
 * The one authorization layer (rules/data.md). Every server component, route
 * handler and server action starts here. There are no database policies.
 */

export class NotAllowed extends Error {
  constructor(message = "notAllowed") {
    super(message);
    this.name = "NotAllowed";
  }
}

/**
 * The person actually signed in, whatever they are looking at. Never throws.
 *
 * Everything that decides whether view-as is ALLOWED reads this and not
 * `getUser`, so a forged cookie can never widen anybody's powers: the role
 * being checked is always the one in the session.
 */
export async function getRealUser(): Promise<SessionUser | null> {
  const session = await auth();
  const u = session?.user as (SessionUser & { active?: boolean }) | undefined;
  if (!u?.id || u.active === false) return null;
  return { id: u.id, name: u.name, email: u.email, role: u.role, locale: u.locale ?? "en" };
}

/**
 * Whose eyes the app is being read through — the signed-in user, or the person
 * an admin has chosen to view as (P8.8, src/lib/view-as.ts). Never throws.
 *
 * An inactive account cannot be viewed either: a deactivated user cannot sign
 * in, and a screen that renders as them would be a way around that.
 */
export async function getUser(): Promise<SessionUser | null> {
  const real = await getRealUser();
  if (!real) return null;

  const wanted = (await cookies()).get(VIEW_AS_COOKIE)?.value;
  if (!shouldView(real.role, real.id, wanted)) return real;

  const [row] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      locale: users.locale,
      active: users.active,
    })
    .from(users)
    .where(eq(users.id, wanted as string))
    .limit(1);

  if (!row || !row.active) return real;

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role as Role,
    locale: (row.locale as "en" | "ar") ?? real.locale,
    viewedBy: { id: real.id, name: real.name },
  };
}

/** For server components: redirect to login when signed out. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getUser();
  if (!user) {
    const locale = await getLocale();
    redirect({ href: "/login", locale });
  }
  return user as SessionUser;
}

/**
 * For server actions and route handlers: throw instead of redirecting.
 *
 * This is the one door every write in the app goes through, which is why
 * view-as is enforced here and not on the screens. An admin reading a rep's
 * floor through somebody else's eyes can press anything a missed `mine` check
 * left on screen and nothing will happen (P8.8).
 */
export async function requireActor(...roles: Role[]): Promise<SessionUser> {
  const user = await getUser();
  if (!user) throw new NotAllowed("signedOut");
  if (user.viewedBy) throw new NotAllowed("viewingOnly");
  if (roles.length && !roles.includes(user.role)) throw new NotAllowed();
  return user;
}

/**
 * The signed-in person, for the two actions that are about viewing itself.
 *
 * Starting and stopping have to work while viewing — otherwise the only way out
 * would be to sign out — so they ask for the real user rather than the viewed
 * one, and check the real role themselves.
 */
export async function requireRealActor(...roles: Role[]): Promise<SessionUser> {
  const user = await getRealUser();
  if (!user) throw new NotAllowed("signedOut");
  if (roles.length && !roles.includes(user.role)) throw new NotAllowed();
  return user;
}

export function can(user: SessionUser, ...roles: Role[]): boolean {
  return roles.includes(user.role);
}

/**
 * Manager and admin see every rep's records; a rep sees only his own. Seeing,
 * not working: writing on a floor is `mayWrite` in src/lib/floor.ts, and it
 * answers no to both of them (D42).
 */
export function seesAll(user: SessionUser): boolean {
  return seesAllRoles(user.role);
}

/** Where each role lands after sign-in. */
export function homeFor(role: Role): string {
  switch (role) {
    case "coordinator":
      return "/queue";
    case "manager":
    case "admin":
      return "/team";
    default:
      // A rep's home is his day, not his company list (P8). The list is still
      // one press away and is still where he searches; what it never was is an
      // answer to "what do I do now", which is the question he opens the app
      // with.
      return "/day";
  }
}
