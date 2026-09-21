import "server-only";
import { cache } from "react";
import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { seesAllRoles } from "./floor";
import { shouldView, VIEW_AS_COOKIE } from "./view-as";
import { ROLES, type Role, type SessionUser } from "./types";

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
 * The sentence key a refused actor is answered with (`common.*`). A session
 * that has ended is said as such: "you are not allowed to do that" told a rep
 * whose sign-in had expired mid-form that he was doing something wrong, when
 * all he has to do is sign in again in another tab and press Save once more
 * (P11I, D135). Every other reason a NotAllowed carries is a real refusal.
 */
export const REFUSAL_KEYS = ["notAllowed", "signedOut"] as const;

export function refusalKey(error: NotAllowed): (typeof REFUSAL_KEYS)[number] {
  return error.message === "signedOut" ? "signedOut" : "notAllowed";
}

/**
 * The person actually signed in, whatever they are looking at. Never throws.
 *
 * Everything that decides whether view-as is ALLOWED reads this and not
 * `getUser`, so a forged cookie can never widen anybody's powers: the role
 * being checked is always the one in the session.
 */
/**
 * Once per request. The layout, the page, the shell's bell and every figure on
 * a screen ask who is signed in, and each ask was a session row and a user row
 * from the database — seven times on the manager's day (§5 #71, D131). React's
 * `cache` is scoped to one server request, so the first answer serves them all
 * and a second request starts clean.
 */
export const getRealUser = cache(async function getRealUser(): Promise<SessionUser | null> {
  const session = await auth();
  const u = session?.user as (SessionUser & { active?: boolean }) | undefined;
  if (!u?.id || u.active === false) return null;
  return {
    id: u.id,
    name: u.name,
    nameAr: u.nameAr ?? null,
    email: u.email,
    role: u.role,
    locale: u.locale ?? "en",
  };
});

/**
 * Whose eyes the app is being read through — the signed-in user, or the person
 * an admin has chosen to view as (P8.8, src/lib/view-as.ts). Never throws.
 *
 * An inactive account cannot be viewed either: a deactivated user cannot sign
 * in, and a screen that renders as them would be a way around that.
 */
export const getUser = cache(async function getUser(): Promise<SessionUser | null> {
  const real = await getRealUser();
  if (!real) return null;

  const wanted = (await cookies()).get(VIEW_AS_COOKIE)?.value;
  if (!shouldView(real.role, real.id, wanted)) return real;

  const [row] = await db
    .select({
      id: users.id,
      name: users.name,
      nameAr: users.nameAr,
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
    nameAr: row.nameAr,
    email: row.email,
    role: row.role as Role,
    locale: (row.locale as "en" | "ar") ?? real.locale,
    viewedBy: { id: real.id, name: real.name, nameAr: real.nameAr },
  };
});

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
 * A screen this role may not open: back to his own home — not an error page, a
 * floor (DESIGN §5). Seven pages carried the test as two hand-copied lines
 * each, and the spec that swept them was a third copy of the list that had
 * missed one (D99). It is one sentence per gate below, and nothing anywhere
 * else.
 */
async function requireRole(mayOpen: (role: Role) => boolean): Promise<SessionUser> {
  const user = await requireUser();
  if (!mayOpen(user.role)) {
    const locale = await getLocale();
    redirect({ href: homeFor(user.role), locale });
  }
  return user;
}

/** The admin's screens, and only his (SPEC §3): targets, lookups, use, archive, export. */
export async function requireAdmin(): Promise<SessionUser> {
  return requireRole((role) => role === "admin");
}

/**
 * Who runs the office, as against who runs the app (SPEC §3, P14: "the holidays
 * and leave tab and the users tab belong to the sales manager as well as the
 * admin").
 *
 * Those two tabs are not administration of the software, they are the running
 * of a fourteen-person business: who works here, and which days they are here.
 * Abdulrahman hires the rep, signs his leave and is asked on a Tuesday when
 * Saad is back — and until P14 the only person in the building who could answer
 * any of it from Kladra was Jerom, who does not sell. The other five admin tabs
 * stay the admin's: a target is the figure a person is measured against, a
 * lookup changes every dropdown in the app, and the archive, the use screen and
 * the export are the app itself.
 *
 * One predicate and one gate, because the alternative is the copied role list
 * at seven pages that D99 already caught once.
 */
export function runsTheOffice(role: Role): boolean {
  return role === "admin" || role === "manager";
}

/**
 * The same sentence as a list, for the action guards, which take roles rather
 * than a predicate. Derived from `ROLES` and never typed out beside it: a hand
 * list next to a predicate is the drift that made `mayTouch` a bug (D42).
 */
export const OFFICE_ROLES: Role[] = ROLES.filter(runsTheOffice);

/** Users, and Holidays and leave: the admin's, and the sales manager's (P14). */
export async function requireOffice(): Promise<SessionUser> {
  return requireRole(runsTheOffice);
}

/**
 * May this person create, edit, deactivate or reset the password of an account
 * in this role? (SPEC §4, P14, from the founder's "decide what he may not do".)
 *
 * The admin, anybody. The sales manager, anybody BELOW him — a rep, marketing,
 * the coordinator — and nobody at his own level or above it: not the admin, not
 * another sales manager, and not his own account either, which is level with
 * his own by the same arithmetic and needs no exception written for it.
 *
 * That the answer is `runsTheOffice` again is not a coincidence worth hiding:
 * the people who can change accounts are exactly the people whose accounts a
 * manager may not change. Written as one predicate, it cannot drift into two.
 *
 * Nothing else on the two tabs is narrowed. Holidays and leave are his
 * outright, the admin's own leave included — a day off is not a power, it is a
 * day the office does not have him.
 */
export function mayActOnUser(actor: Role, subject: Role): boolean {
  if (actor === "admin") return true;
  return actor === "manager" && !runsTheOffice(subject);
}

/**
 * Which roles this person may hand out, derived from the sentence above rather
 * than listed beside it: a manager may not make an admin or a second manager,
 * because he may not act on one either.
 */
export function assignableRoles(actor: Role): Role[] {
  return ROLES.filter((role) => mayActOnUser(actor, role));
}

/**
 * For server actions and route handlers: throw instead of redirecting.
 *
 * This is the one door every write in the app goes through, which is why
 * view-as is enforced here and not on the screens. An admin reading a rep's
 * floor through somebody else's eyes can press anything a missed `mine` check
 * left on screen and nothing will happen (P8.8).
 */
/**
 * For route handlers that only READ for the signed-in person — the live
 * channel and the bell's count. Viewing is allowed: the admin reading Faisal's
 * floor sees Faisal's events and Faisal's count, and writes nothing (D105).
 * `requireActor` gated both, so live updates went dark the moment anybody
 * pressed "view as".
 */
export async function requireReader(): Promise<SessionUser> {
  const user = await getUser();
  if (!user) throw new NotAllowed("signedOut");
  return user;
}

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
      //
      // Marketing too, since SPEC §3 P13: "a rep in everything, plus a Leads
      // module". P12-7 sent it to /leads while it quoted nothing and its day was
      // only a call list; its day now carries a month, a pace line, the paper
      // waiting on it and the leads given to it, which is the question a rep
      // opens Kladra with. Leads is one press away, third in its rail.
      return "/day";
  }
}

/**
 * The session cookie's own name, whatever the deployment made it. Auth.js
 * prefixes it `__Secure-` when it decides the site is https (rules/deploy.md),
 * so neither name can be written down — the suffix is the constant, which is
 * the test `tests/unhappy.spec.ts` already uses to find the same cookie.
 */
const SESSION_COOKIE_SUFFIX = "session-token";

/** The token in this request's cookie jar, or none. */
export async function sessionTokenHere(): Promise<string | null> {
  const jar = await cookies();
  const found = jar.getAll().find((c) => c.name.endsWith(SESSION_COOKIE_SUFFIX));
  return found?.value || null;
}

/**
 * Is this session still a session — right now, asked of the database rather
 * than of anything the request carried?
 *
 * The same condition as the revocation point in `src/auth.config.ts`, and it is
 * here for the one caller that cannot use that one. Every other way into Kladra
 * is a REQUEST, and D17's "it ends on the very next request" is true of all of
 * them. `/api/events` is not a request, it is a socket that stays open for
 * days: `requireReader` runs once, at connect, and a rep deactivated an hour
 * later went on hearing quotation and dispatch numbers on a laptop nobody had
 * closed. Nothing followed — his browser's answer to every event is a refresh,
 * and the refresh is refused — but the promise D17 makes had one exception, and
 * it was the one channel designed to outlive the request that opened it.
 *
 * Expiry is asked here and nowhere else in this app: Auth.js checks it inside
 * its own session read, which the stream does not go through.
 */
export async function sessionStillLive(token: string): Promise<boolean> {
  const [row] = await db
    .select({ token: sessions.sessionToken })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.sessionToken, token),
        eq(users.active, true),
        gt(sessions.expires, new Date()),
      ),
    )
    .limit(1);
  return Boolean(row);
}
