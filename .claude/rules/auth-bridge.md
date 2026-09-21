---
paths:
  - "package.json"
  - "package-lock.json"
  - "src/auth/**"
  - "src/auth.ts"
---

# The auth bridge — silent failure on upgrade

**For:** any change to the auth family. **Prevents:** revocation silently
dying while login keeps working.

Kladra uses Auth.js credentials login with **sessions stored in the
database**. Credentials providers only mint JWTs by default, so the database
session is created by a `jwt.encode` override (the "bridge") that inserts a
`sessions` row and returns its token as the cookie value.

After ANY upgrade of `next-auth`, `@auth/core` or `next`, **run
`tests/admin.spec.ts` and `tests/unhappy.spec.ts`**. Between them they drive
every part of the bridge: admin signs in and counts the `sessions` row the
cookie made ("signing in did not create a database session"), then deactivates
a user and proves the next request is refused; unhappy deletes the row the
cookie names and proves the very next write says the session ended.

`tests/login.spec.ts` is NOT one of them, whatever it sounds like — it walks
the sign-in screen and its error copy and never opens the database. This rule
named it for three phases (P14.5).

The failure is **silent**: if the override stops minting a database session,
login still works, screens still render, and sessions stop being revocable —
a sacked employee stays signed in. Only a test that drives the real bridge
can see it.

Treat any bump of the auth packages as the event this rule exists for.
