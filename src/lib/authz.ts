import "server-only";
import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { auth } from "@/auth";
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

/** The signed-in user, or null. Never throws. */
export async function getUser(): Promise<SessionUser | null> {
  const session = await auth();
  const u = session?.user as (SessionUser & { active?: boolean }) | undefined;
  if (!u?.id || u.active === false) return null;
  return { id: u.id, name: u.name, email: u.email, role: u.role, locale: u.locale ?? "en" };
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

/** For server actions and route handlers: throw instead of redirecting. */
export async function requireActor(...roles: Role[]): Promise<SessionUser> {
  const user = await getUser();
  if (!user) throw new NotAllowed("signedOut");
  if (roles.length && !roles.includes(user.role)) throw new NotAllowed();
  return user;
}

export function can(user: SessionUser, ...roles: Role[]): boolean {
  return roles.includes(user.role);
}

/** Manager and admin see every rep's records; a rep sees only his own. */
export function seesAll(user: SessionUser): boolean {
  return user.role === "manager" || user.role === "admin";
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
      return "/companies";
  }
}
