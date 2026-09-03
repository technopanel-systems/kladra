# CLAUDE.md — Kladra

Kladra is the CRM and operations tool for Technopanel (Riyadh, aluminium composite
panel cladding, fourteen people). It replaces FACET at `C:\dev\facet-crm`, which is a
**read-only reference library**: read it for business knowledge and traps; never copy
screens or design rules forward; never write there; never touch its containers,
port 3000, port 5432 or its tunnel. Hooks H0/H12 enforce this.

## Stack
Next.js (App Router, TypeScript, `src/`) · Tailwind + shadcn/ui · next-intl (en, ar,
RTL) · Drizzle + PostgreSQL 17 · Auth.js credentials with database sessions · Zod ·
server actions for every write · one Server-Sent Events route for live updates ·
Playwright. Ports: app **3100**, Postgres **5433**, compose project **kladra**.

## Five files, nothing else
- **SPEC.md** — people, how the business works, founder decisions (§3), defaults Claude chose (§4).
- **DESIGN.md** — identity tokens, principles, component kit, what is not built.
- **WORKFLOW.md** — §0 checklist and where-I-stopped, toolbox, how a session runs, acceptance scripts.
- **CLAUDE.md** — this file. **README.md** — run, seed logins, tests, deployment, backups.
No other `.md` in the repo (hook H2). Skills, rules and agents under `.claude/` are not documents.

## How Jerom and Claude Code work
Jerom is the founder and not a developer. He decides in chat; Claude Code builds. One
session at a time. Every session starts by reading WORKFLOW.md §0 and continues from the
first unchecked box. When a decision is not covered, pick what a sales rep would find
obvious, record it in SPEC.md §4 as "DEFAULT — founder may change", and continue.

## The process rule
A screen is done when its user has tried it: Faisal (rep), Rawan (coordinator),
Abdulrahman (manager), Jerom (admin). Until then it is a Playwright acceptance run in
WORKFLOW.md §3 plus shot-looker screenshots at 1366 and 375, en and ar, dark and light.
Both locales ship together — a string that exists in `messages/en.json` and not in
`messages/ar.json` fails the build (`npm run check:messages`).

## Commands
`npm run dev` (3100) · `npm run typecheck` · `npm run lint` · `npm run build` ·
`npm run test` (boots dev on 3100 against a freshly seeded DB, both locales) ·
`npm run db:migrate` · `npm run db:clear` · `npm run seed:demo` · `npm run backup`.
Every commit is green on typecheck, lint, build, test.

## Rules that load themselves
`.claude/rules/data.md` (SQL traps, Riyadh today, one definition per figure),
`migrations.md` (silent no-ops, confirm from information_schema), `deploy.md`
(loopback ports, PUBLIC_URL), `auth-bridge.md` (database sessions from credentials).
Hooks: `guard-writes.mjs` H0–H9, `guard-bash.mjs` H11–H12.

## Never
No third-party agent frameworks or swarms. No production data — migrations clear.
No comments feature, refresh buttons, drag-and-drop, bulk edit, saved views, charts
beyond bars. No internal codes or IDs on screen. Max six installed skills.
