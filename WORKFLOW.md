# WORKFLOW — how Kladra gets built

## §0 Checklist and where I stopped

- [x] P0 Toolbox
- [x] P1 Extract from FACET → the five files (redone from C:\Projects\facet-crm)
- [x] P2 Scaffold: app, database, login, shell, seed, live updates, tests
- [x] P3 Rep floor: companies, contacts, projects, log, follow-ups, search
- [x] P3.5 Edit company, contact, project; archive contact and project; the SPEC §4 cuts go away
- [x] P3.6 Root causes: no primary action disabled while data loads; the four review findings
      become DESIGN rules with tests; one word per concept in both languages, glossary in SPEC;
      tests get their own database, `kladra_test`
- [x] P4 Quotations: rep request → coordinator issue / send back → customer decision
- [ ] P5 Dispatches: rep raise → coordinator approve / refuse → target counting
- [ ] P6 Manager view, admin, notifications
- [ ] P7 Polish, acceptance runs, PWA, handover

P3.5 before P3.6 on purpose: P3.6's terminology sweep and its "one sentence per rejected input"
rule have to cover the edit screens too, and sweeping twice is how a second definition survives.

**Where I stopped:** P4 done and green, `npm run test` 33 passing across both locales. Starting P5.

P4's two real defects were both about a component disappearing at the moment it worked. A dialog
rendered inside an empty state is destroyed by the save that fills the list, and a destroyed
component's success effect never runs — so the first quotation a rep raised on a project saved in
silence and left him where he started, while the second one worked. Five triggers were written
that way and now sit above their list instead of inside it. Where the button genuinely has to go
— raising a revision removes the button it was raised from — the answer is awaited rather than
watched for (`useSubmitAction`). Recorded as D35.

Three things came out of the screenshot pass rather than the box. The number in the company
drawer was the one the rep typed, not the stored one, so it showed ungrouped and its WhatsApp link
had no country code; the storage form is now its own TypeScript type and the substitution cannot
compile (D34). A date had thirteen call sites each deciding its own layout, and now has one
component and a test that measures which way round it renders (D33). The top bar's search button
carried a sentence it only had room for at 1024px and was cut mid-word at 768.

P3.6 found more than the four review findings. The company drawer's projects tab crashed to
"This page couldn't load" on a tab click in Arabic: a `<Button>` a server component hands to a
dialog as its trigger reaches the browser as a lazy wrapper, not an element, and Radix's
`asChild` throws on it. Six triggers were written that way; every trigger in the kit resolves it
now (`useSlotChild`). Two guards came out of it — any uncaught browser exception fails the spec
that provoked it, and `<Hydrated>` marks the document when React takes over so a press cannot
land before the screen is live.

The tests now own `kladra_test` on port 3101, because a run had been clearing the database a
screenshot pass was reading. Forms carry `noValidate` so the action's sentence is the only
sentence. Thirty-nine Arabic strings spoke to a man and now address nobody;
`npm run check:messages` fails on the marked forms. SPEC §5 is the glossary. D31 records an
overrule of a §3 line: an empty list shows its primary action where that action exists.

Dead code swept: `companyOwner`, `formatInstant`, `isSaudi`, `defaultLocation`, `isValidPhone`,
`ROLES`. `defaultLocation` was a second definition of a figure `src/actions/forms.ts` already
owned — the exact drift trap. `src/lib/money.ts` and `src/lib/workdays.ts` keep their unwired
arithmetic: it is P4's and P6's, and rewriting it a box later is churn, not a fix.

## §1 Toolbox — six skills plus find-skills; one unused for two hours is removed

| Skill (source) | For |
|---|---|
| find-skills (vercel-labs/skills) | Searching the registry when a capability is missing. |
| frontend-design (anthropics/skills) | Aesthetic direction, so screens do not read as shadcn defaults. |
| vercel-react-best-practices (vercel-labs) | React 19 and Server Component patterns. |
| web-design-guidelines (vercel-labs) | The review at the end of P3–P6: accessibility, focus, contrast, motion. |
| next-best-practices (vercel-labs/openreview) | Next 16: caching, server actions, proxy, route handlers. |
| shadcn (official) | CLI usage and composition for the DESIGN §3 kit. |
| playwright-testing (alinaqi/maggy) | Locators, fixtures, clock control, flake avoidance. |

Agents: shot-looker (sonnet) · screen-builder (xhigh) · test-runner (sonnet) · arabic-reviewer
(opus). Hooks `guard-writes.mjs` H0–H9, `guard-bash.mjs` H11–H12; rules in `.claude/rules/`.

## §2 The charter — how this gets built

**I own this system.** Not a task list being executed. FACET failed because its interface was
record-first, still, and built to be verified rather than used, and fourteen people went back to
a Google Sheet. I know that business, and I know Faisal, Rawan, Abdulrahman and Jerom by name.
From here I decide how Kladra gets built, and I do not stop until it is finished.

**Authority.** Change, delete or rewrite anything already built — whole phases, the schema, the
shell, my own earlier decisions, DESIGN.md, this file. Search the web whenever unsure: Next.js,
Drizzle, shadcn, Playwright, Arabic RTL, CRM conventions, accessibility. Never guess an API that
can be checked. Add, remove or replace skills whenever they help; no cap. Spawn subagents freely
for parallel work, one writer per file, no third-party frameworks or swarms ever. Pick defaults
without asking and record each in SPEC §4 as "DEFAULT — founder may change".

**The one limit.** SPEC §3 is what real users asked for after testing FACET. An item there may be
overruled only by writing in SPEC §4 what was observed and why the users' version does not work.
Never delete one silently.

**Fix causes, not symptoms.** Every defect gets two questions: where did this originate, and where
else does it live? The bidi date bug was in two places and would have come back in every quotation
date. Fixing one site is not finished. Sweep the whole system for the same cause, fix all of it,
write the rule in DESIGN.md, and add the Playwright test that makes reintroducing it impossible.

**Never stop.** No pause between boxes, no permission, no report until the end. Commit at the end
of every box, update §0, start the next immediately. Only a usage limit or a model change ends a
session; on restart, read §0 and carry on.

**Checkpoint audits.** At the end of every box, and on `/audit`, read the code as a critic rather
than its author. Does this screen make a rep's day faster than the Google Sheet did? Is any of it
record-first? Is a rule now wrong? Fix what is found in the same session. After a model change the
audit is broader: treat the previous model's work as another developer's and check it properly.

**Inside a box:** schema → query → server action → screen → both locales → Playwright →
shot-looker (1366/375 × en/ar × dark/light) → arabic-reviewer → fix → web-design-guidelines.

**Before every commit:** `npm run typecheck && npm run lint && npm run build && npm run test`.
If a box cannot get green, cut scope inside it, note the cut in §0, commit green.

**Guards.** Never `docker stop/down/rm` outside compose project `kladra` (H12). If Docker is down,
retry every minute for 30 minutes. If `git push` fails, commit locally and continue. FACET at
`C:\Projects\facet-crm` is read-only. A build run deploys nothing.

**Commands** in `.claude/commands/`: `/go` continue from the first unchecked box · `/audit` audit
everything built, fix, then continue · `/state` ten lines on where things stand.

## §3 Acceptance scripts — the Playwright tests walk these steps, in en and ar

**Faisal (rep)** — `tests/rep.spec.ts`
1. Sign in as Faisal. Home is Companies with the follow-up strip at the top.
2. Add company "Al Noor Towers" with contact Khalid, phone 0551234567. Toast; row highlighted; drawer opens.
3. Log a visit: "Showed catalogue, wants 4 mm samples", follow-up tomorrow. Toast; it is first in Activity.
4. Move the clock to tomorrow; the strip says 1 today and the company is listed under it.
5. Open the company, add project "Tower A" with 1,200 m² expected. It appears under Projects.

**Rawan-1 (coordinator, quotations)** — `tests/quotations.spec.ts`
1. Faisal opens a project and requests a quotation with two items; the totals add up as he types; he saves.
2. The drawer that opens shows the same four figures, worked out again in SQL.
3. Rawan's Queue, open in another browser and never reloaded, shows the request arrive and her bell rise by one.
4. Rawan sends it back with a reason. Faisal is told, reads the reason, changes a price and asks again.
5. Rawan issues it with SMAC's number. Faisal marks it Customer accepted, then raises a revision: it is Q-n/2 and the first is Superseded.
6. Second test: Faisal withdraws a request of his own. It leaves Rawan's queue and stays readable, marked Withdrawn.

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
