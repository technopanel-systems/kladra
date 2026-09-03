# WORKFLOW — how Kladra gets built

## §0 Checklist and where I stopped

- [x] P0 Toolbox
- [ ] P1 Extract from FACET → the five files
- [ ] P2 Scaffold: app, database, login, shell, seed, live updates, tests
- [ ] P3 Rep floor: companies, contacts, projects, log, follow-ups, search
- [ ] P4 Quotations: rep request → coordinator issue / send back → customer decision
- [ ] P5 Dispatches: rep raise → coordinator approve / refuse → target counting
- [ ] P6 Manager view, admin, notifications
- [ ] P7 Polish, acceptance runs, handover

**Where I stopped:** P0 done — settings, hooks, rules, shot-looker, six skills, Chromium.
Next: P1 — read FACET's SPEC, archive docs 01/04/07/08/30, lookup seeds, globals.css, legacy/app/rep.

## §1 Toolbox — what is installed and why

Hard cap: six skills. A skill unused for two hours after install is removed.

| Skill | Source | Why |
|---|---|---|
| frontend-design | anthropics/skills (copied from the marketplace clone) | Aesthetic direction so screens do not read as shadcn defaults. |
| shadcn | shadcn/ui@shadcn (skills.sh, official) | Correct CLI usage, component docs, composition patterns for the §3 kit. |
| nextjs-app-router-patterns | wshobson/agents (skills.sh) | Server Components, server actions, streaming, route conventions. |
| drizzle-best-practices | honra-io/drizzle-best-practices (skills.sh) | Postgres schema, relations, migrations, drizzle-zod; 30 reference files. |
| playwright-testing | alinaqi/maggy@playwright-testing (skills.sh) | Locator strategy, fixtures, clock control, flaky-test avoidance for the acceptance runs. |
| playwright-cli | @playwright/cli (ships its own SKILL.md) | The shot-looker agent drives a real browser from the terminal. |

Also: `.claude/hooks/guard-writes.mjs` (H0–H9) and `guard-bash.mjs` (H11–H12),
copied from FACET and re-pointed at Kladra; H10 "commit must cite a rule" removed.
`.claude/rules/` carries the four trap files (data, migrations, deploy, auth-bridge).
`.claude/agents/shot-looker.md` reads screenshots. Chromium via `npx playwright install chromium`.

## §2 How a session runs

(P1)

## §3 Acceptance scripts per role

(P3–P6)
