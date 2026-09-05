/**
 * Auth.js — credentials sign-in over DATABASE sessions.
 *
 * Nobody self-registers (SPEC §2 S7): the admin creates users, deactivates
 * them, and that must sign them out at once (SPEC §4 D17). A JWT cannot be
 * revoked, so the cookie has to name a row in `sessions`.
 *
 * Auth.js does not create that row for a Credentials provider on its own —
 * credentials sign-ins go through the JWT machinery whatever the strategy. The
 * bridge (.claude/rules/auth-bridge.md) closes the gap from inside Auth.js:
 *
 *   1. `callbacks.jwt` marks the token that came from a credentials sign-in.
 *   2. `jwt.encode` intercepts exactly that token, inserts a `sessions` row
 *      through the adapter and returns the raw session token — so the cookie
 *      carries a database session token and never a JWT.
 *   3. `jwt.decode` returns null: nothing here may be trusted because it
 *      decodes as a signed token.
 *   4. Every later `auth()` resolves the cookie through
 *      `adapter.getSessionAndUser`, and `signOut()` deletes the row.
 *
 * Two traps, both silent:
 *
 * - `session.strategy` is deliberately NOT written out. With an adapter and no
 *   explicit strategy @auth/core already defaults to "database"; writing
 *   `strategy: "database"` trips assertConfig's "credentials requires JWT"
 *   guard, which only tests the explicit value, and every sign-in 500s.
 * - Removing the `jwt.encode` override does not break login. It breaks
 *   revocation: a sacked employee stays signed in and nothing says so. Only a
 *   test that drives the real bridge can see it — re-run it after any bump of
 *   next-auth, @auth/core or next.
 */
import "server-only";

import { randomUUID } from "node:crypto";

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { encode as defaultEncode } from "next-auth/jwt";

import { SESSION_MAX_AGE, kladraAdapter, verifyCredentials } from "@/auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: kladraAdapter,
  // No `strategy` here on purpose — see the header note.
  session: { maxAge: SESSION_MAX_AGE },
  // Fallback only. The real signed-out redirect is locale-aware and issued by
  // requireUser() in src/lib/authz.ts.
  pages: { signIn: "/login" },
  // AUTH_SECRET, AUTH_URL and AUTH_TRUST_HOST are read from the environment by
  // next-auth's own setEnvDefaults, at request time. Reading them here would
  // evaluate them at module load, where a container build has no .env.
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: (credentials) => verifyCredentials(credentials?.email, credentials?.password),
    }),
  ],
  callbacks: {
    jwt({ token, account }) {
      if (account?.provider === "credentials") token.credentials = true;
      return token;
    },
    /**
     * `user` is the adapter's AdapterUser, read from the row on this request —
     * so role, locale and active are current, not whatever they were at
     * sign-in. This is the shape src/lib/authz.ts consumes.
     */
    session({ session, user }) {
      session.user = {
        id: user.id,
        name: user.name,
        nameAr: user.nameAr,
        email: user.email,
        role: user.role,
        locale: user.locale,
        active: user.active,
        // Auth.js's AdapterUser demands the field; Kladra has no email
        // provider and no column behind it.
        emailVerified: null,
      };
      return session;
    },
  },
  jwt: {
    /** The bridge. Load-bearing: see the header note. */
    async encode(params) {
      const token = params.token as { credentials?: boolean; sub?: string } | null;
      if (!token?.credentials) {
        // Unreachable while credentials is the only provider; kept so that a
        // second provider degrades to Auth.js's own behaviour rather than to a
        // blank cookie.
        return defaultEncode(params);
      }
      const userId = token.sub;
      if (!userId) throw new Error("Credentials sign-in produced no user id");
      const sessionToken = randomUUID();
      await kladraAdapter.createSession!({
        sessionToken,
        userId,
        expires: new Date(Date.now() + SESSION_MAX_AGE * 1000),
      });
      return sessionToken;
    },
    /**
     * Nothing in Kladra is a JWT. The database branch of Auth.js never calls
     * this; returning null makes sure that if some path ever does, a forged or
     * stale signed token cannot become a session.
     */
    async decode() {
      return null;
    },
  },
});
