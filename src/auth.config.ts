/**
 * The half of auth that is plain data access: the session adapter and the
 * password check. It is deliberately free of `server-only`, `next-auth` and
 * anything React, so a script can drive the real adapter against the real
 * database and prove revocation actually revokes (.claude/rules/auth-bridge.md
 * — the failure this guards is silent). src/auth.ts wires it into Auth.js.
 */
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import type { Adapter, AdapterSession, AdapterUser } from "@auth/core/adapters";

import { db } from "@/db";
import { sessions, users } from "@/db/schema";

/** Sessions last 30 days; sign-out is explicit (SPEC §3). */
export const SESSION_MAX_AGE = 30 * 24 * 60 * 60;

/**
 * A bcrypt hash of a value nobody knows, compared against when the email is
 * unknown so a wrong email and a wrong password take the same time. Without it
 * the form answers "no such user" in a millisecond and "wrong password" in a
 * hundred, which is an account-enumeration oracle in everything but name.
 */
const DECOY_HASH = "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

type UserRow = typeof users.$inferSelect;
type SessionRow = typeof sessions.$inferSelect;

function toAdapterUser(row: UserRow): AdapterUser {
  return {
    id: row.id,
    name: row.name,
    nameAr: row.nameAr,
    email: row.email,
    // Kladra has no email provider; the column does not exist and never will.
    emailVerified: null,
    role: row.role,
    locale: row.locale === "ar" ? "ar" : "en",
    active: row.active,
  };
}

function toAdapterSession(row: SessionRow): AdapterSession {
  return { sessionToken: row.sessionToken, userId: row.userId, expires: row.expires };
}

/**
 * Present so `assertConfig` finds the key (it tests `method in adapter`, not
 * whether it works) and loud if anything ever reaches it. These four run only
 * on an OAuth, email or WebAuthn sign-in; Kladra has none of the three.
 */
function unreachable(method: string): () => never {
  return () => {
    throw new Error(
      `kladraAdapter.${method} was called. Kladra signs in with credentials only — ` +
        "no OAuth, no email links, no WebAuthn. Reaching this is a configuration bug.",
    );
  };
}

/**
 * The whole adapter: sessions, and the two user reads Auth.js needs to resolve
 * one. No accounts table and no verification tokens — @auth/drizzle-adapter
 * would demand both and Kladra's schema has neither.
 */
export const kladraAdapter: Adapter = {
  async getUser(id) {
    const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return row ? toAdapterUser(row) : null;
  },

  async getUserByEmail(email) {
    const [row] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.trim().toLowerCase()))
      .limit(1);
    return row ? toAdapterUser(row) : null;
  },

  async createSession(data) {
    const [row] = await db.insert(sessions).values(data).returning();
    return toAdapterSession(row);
  },

  /**
   * The revocation point. The INNER JOIN carries `users.active`, so a
   * deactivated account resolves to no session at all: Auth.js treats that
   * exactly like an unknown cookie, clears it, and the next screen is the
   * login page. The row stays for the audit trail; the admin's deactivation is
   * what ends the session, and it ends it on the very next request (SPEC §4
   * D17). Move this condition out of the query and revocation dies silently —
   * login still works, screens still render, nobody can be signed out.
   */
  async getSessionAndUser(sessionToken) {
    const [row] = await db
      .select({ session: sessions, user: users })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.sessionToken, sessionToken), eq(users.active, true)))
      .limit(1);
    if (!row) return null;
    return { session: toAdapterSession(row.session), user: toAdapterUser(row.user) };
  },

  async updateSession(data) {
    if (!data.expires) return null;
    const [row] = await db
      .update(sessions)
      .set({ expires: data.expires })
      .where(eq(sessions.sessionToken, data.sessionToken))
      .returning();
    return row ? toAdapterSession(row) : null;
  },

  async deleteSession(sessionToken) {
    const [row] = await db
      .delete(sessions)
      .where(eq(sessions.sessionToken, sessionToken))
      .returning();
    return row ? toAdapterSession(row) : null;
  },

  createUser: unreachable("createUser"),
  getUserByAccount: unreachable("getUserByAccount"),
  updateUser: unreachable("updateUser"),
  linkAccount: unreachable("linkAccount"),
};

/**
 * Email and password against `users`. Nobody self-registers (SPEC §2 S7), so
 * this is the only door.
 *
 * It answers `null` for every failure — unknown email, deactivated account,
 * wrong password — and the caller says one sentence for all of them. Telling
 * the two apart turns the login form into a list of who works here and who was
 * let go.
 */
export async function verifyCredentials(
  email: unknown,
  password: unknown,
): Promise<{ id: string; name: string; email: string } | null> {
  const address = typeof email === "string" ? email.trim().toLowerCase() : "";
  const secret = typeof password === "string" ? password : "";
  if (!address || !secret) return null;

  const [row] = await db.select().from(users).where(eq(users.email, address)).limit(1);
  const matches = await bcrypt.compare(secret, row?.passwordHash ?? DECOY_HASH);
  if (!row || !row.active || !matches) return null;

  return { id: row.id, name: row.name, email: row.email };
}
