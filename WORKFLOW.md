# WORKFLOW — how Kladra gets built

## §0 Checklist and where I stopped

- [x] P0 Toolbox
- [x] P1 Extract from FACET → the five files (redone from C:\Projects\facet-crm)
- [ ] P2 Scaffold: app, database, login, shell, seed, live updates, tests
- [ ] P3 Rep floor: companies, contacts, projects, log, follow-ups, search
- [ ] P4 Quotations: rep request → coordinator issue / send back → customer decision
- [ ] P5 Dispatches: rep raise → coordinator approve / refuse → target counting
- [ ] P6 Manager view, admin, notifications
- [ ] P7 Polish, acceptance runs, handover

**Where I stopped:** P1 redone — SPEC §2 has 57 sentences from FACET's SPEC and archive; lookups in
scripts/seed/lookups.ts; real en/ar terms in messages/*/common.json. Next: P2 — the scaffold, schema
(25 tables) and migration exist uncommitted; wire auth, shell, seed, LISTEN/NOTIFY → SSE, smoke test.

## §1 Toolbox — what is installed and why

Cap: six skills plus find-skills. A skill unused for two hours after install is removed.

| Skill | Source | For |
|---|---|---|
| find-skills | vercel-labs/skills | Searching the skills.sh registry when a capability is missing. |
| frontend-design | anthropics/skills (copied from the marketplace clone) | Aesthetic direction so screens do not read as shadcn defaults. |
| vercel-react-best-practices | vercel-labs/agent-skills | React 19 / Server Components patterns, data fetching, waterfalls. |
| web-design-guidelines | vercel-labs/agent-skills | Review step at the end of P3, P4, P5, P6: accessibility, focus, contrast, motion. |
| next-best-practices | vercel-labs/openreview (Vercel) | Next 16 App Router: caching, server actions, proxy, route handlers. |
| shadcn | shadcn/ui (official) | CLI usage, component docs, composition for the DESIGN §3 kit. |
| playwright-testing | alinaqi/maggy | Locators, fixtures, clock control, flake avoidance for the acceptance runs. |

Agents in `.claude/agents/`: shot-looker (sonnet, medium) · screen-builder (inherit, xhigh) ·
test-runner (sonnet, medium) · arabic-reviewer (opus, high). Hooks: `guard-writes.mjs`
H0–H9, `guard-bash.mjs` H11–H12. Rules: `.claude/rules/{data,migrations,deploy,auth-bridge}.md`.
Chromium via `npx playwright install chromium`; the shot-looker reads @playwright/cli's own SKILL.md.

## §2 How a session runs

1. Read §0. Continue from the first unchecked box; the note says what is half-done. Never
   ask Jerom during a build run — pick the obvious default, record it in SPEC §4, continue.
2. Inside a box: schema → query → server action → screen → both locales → Playwright
   acceptance → shot-looker (1366/375 × en/ar × dark/light) → arabic-reviewer → fix.
   Subagents run slices in parallel, one writer per file at a time. At the end of P3, P4,
   P5, P6 run the web-design-guidelines skill as a review step.
3. Before every commit: `npm run typecheck && npm run lint && npm run build && npm run
   test`. If a box cannot get green, cut scope inside the box, note the cut in §0, commit green.
4. Tick the box, update "where I stopped", commit. Also commit at natural pauses.
5. Guards: never `docker stop/down/rm` against anything not in compose project `kladra`
   (hook H12). Docker Desktop is expected running; if not, wait and retry every minute for
   up to 30 minutes. If `git push` fails, commit locally and continue. FACET is read-only.
   No agent frameworks. Nothing is deployed by a build run.

## §3 Acceptance scripts per role

Human-readable; the Playwright tests in `tests/` walk exactly these steps, in en and ar.

**Faisal (rep)** — `tests/rep.spec.ts`
1. Sign in as Faisal. Home is Companies with the follow-up strip at the top.
2. Add company "Al Noor Towers" with contact Khalid, phone 0551234567. Toast; row highlighted; drawer opens.
3. Log a visit: "Showed catalogue, wants 4 mm samples", follow-up tomorrow. Toast; it is first in Activity.
4. Move the clock to tomorrow; the strip says 1 today and the company is listed under it.
5. Open the company, add project "Tower A" with 1,200 m² expected. It appears under Projects.

**Rawan-1 (coordinator, quotations)** — `tests/quotation.spec.ts`
1. Faisal opens a company and requests a quotation with two items; totals update live; he saves.
2. Rawan's Queue shows the request arrive without reloading, highlighted, bell count 1.
3. Rawan sends it back: "Add the colour code for item 2". Faisal sees "Sent back" and the reason.
4. Faisal fixes item 2 and resubmits. Rawan issues it with SMAC number 4521.
5. Faisal sees "Issued — SMAC 4521" and marks it Customer accepted.

**Rawan-2 (coordinator, dispatches)** — `tests/dispatch.spec.ts`
1. Faisal opens the issued quotation and raises a dispatch for half of item 1, TT, Riyadh, "50% advance".
2. Rawan's Queue shows the dispatch request; she opens it and sees remaining quantity per item.
3. Rawan approves it with SMAC dispatch number 8810.
4. Faisal's Home target card rises by the approved m².
5. Faisal's Dispatches page shows it as Approved with the number.

**Abdulrahman (manager)** — `tests/manager.spec.ts`
1. Sign in as Abdulrahman. Home shows company target vs achieved and the team table.
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
