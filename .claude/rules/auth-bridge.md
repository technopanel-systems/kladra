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

After ANY upgrade of `next-auth`, `@auth/core`, `@auth/drizzle-adapter` or
`next`, **re-run the auth smoke test** (`tests/auth.spec.ts`): it signs in,
reads the `sessions` row its cookie names, deactivates the user, and proves
the next request is refused.

The failure is **silent**: if the override stops minting a database session,
login still works, screens still render, and sessions stop being revocable —
a sacked employee stays signed in. Only a test that drives the real bridge
can see it.

Treat any bump of the auth packages as the event this rule exists for.
