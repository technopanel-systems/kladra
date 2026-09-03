# WORKFLOW — how Kladra gets built

## §0 Checklist and where I stopped

- [x] P0 Toolbox
- [x] P1 Extract from FACET → the five files
- [ ] P2 Scaffold: app, database, login, shell, seed, live updates, tests
- [ ] P3 Rep floor: companies, contacts, projects, log, follow-ups, search
- [ ] P4 Quotations: rep request → coordinator issue / send back → customer decision
- [ ] P5 Dispatches: rep raise → coordinator approve / refuse → target counting
- [ ] P6 Manager view, admin, notifications
- [ ] P7 Polish, acceptance runs, handover

**Where I stopped:** P1 done — five files written, deploy and backup scripts adapted.
Next: P2 — the scaffold, schema and migration already exist uncommitted; wire auth, shell, seed, SSE, smoke test.

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

1. Read §0. Continue from the first unchecked box; the "where I stopped" note says
   what is half-done. Never ask Jerom a question during a build run — pick the
   obvious default, record it in SPEC.md §4, continue.
2. Inside a box, work in slices: schema → server action → screen → both locales →
   Playwright acceptance → shot-looker (1366/375 × en/ar × dark/light) → fix what
   reads badly. Subagents run slices in parallel, one writer per file at a time.
3. Before every commit: `npm run typecheck && npm run lint && npm run build &&
   npm run test`. If a box cannot get green, cut scope inside the box, note the cut
   in §0, commit green.
4. Tick the box, update "where I stopped", commit. Also commit at any natural pause
   inside a long box.
5. Skills: six max; one unused for two hours after install is removed. No agent
   frameworks. FACET is read-only. Nothing is deployed by a build run.

## §3 Acceptance scripts per role

Human-readable; the Playwright tests in `tests/` walk exactly these steps, in en and ar.

**Faisal (rep)** — `tests/rep.spec.ts`
1. Sign in as Faisal. Home is Companies with the follow-up strip at the top.
2. Add company "Al Noor Towers" with contact Khalid, phone 0551234567. Toast; the row appears highlighted; the drawer opens.
3. Log a visit: "Showed catalogue, wants 4 mm samples", follow-up tomorrow. Toast; it is first in Activity.
4. Move the clock to tomorrow; the strip says 1 today and the company is listed under it.
5. Open the company, add project "Tower A" with 1,200 m² expected. It appears under Projects.

**Rawan-1 (coordinator, quotations)** — `tests/quotation.spec.ts`
1. Faisal opens a company and requests a quotation with two items; the totals update live; he saves.
2. Rawan's Queue shows the new request arrive without reloading, highlighted, bell count 1.
3. Rawan opens it and sends it back: "Add the colour code for item 2". Faisal sees "Sent back" and the reason.
4. Faisal fixes item 2 and resubmits. Rawan issues it with SMAC number 4521.
5. Faisal sees "Issued — SMAC 4521" and marks it Customer accepted.

**Rawan-2 (coordinator, dispatches)** — `tests/dispatch.spec.ts`
1. Faisal opens the issued quotation and raises a dispatch for half of item 1, TT, Riyadh, "50% advance".
2. Rawan's Queue shows the dispatch request; she opens it and sees remaining quantities per item.
3. Rawan approves it with SMAC dispatch number 8810.
4. Faisal's Home target card rises by the approved m².
5. Faisal's Dispatches page shows it as Approved with the number.

**Abdulrahman (manager)** — `tests/manager.spec.ts`
1. Sign in as Abdulrahman. Home shows the company target vs achieved and the team table.
2. Each rep row shows target, achieved, pace, open quotations, overdue follow-ups.
3. The Stuck list names the waiting request, the overdue follow-up and the never-contacted company.
4. Open Faisal's companies read-only; no Add company button.
5. The bell lists his notifications; mark one read and the count drops.

**Jerom (admin)** — `tests/admin.spec.ts`
1. Sign in as Jerom. Admin menu shows Users, Targets, Lookups, Holidays, Export.
2. Create user "Majed" as rep, then reset his password.
3. Set Faisal's target for this month; his Home card shows it.
4. Add a holiday next week; the pace denominator drops by one.
5. Export companies; the CSV opens with Arabic names intact.
