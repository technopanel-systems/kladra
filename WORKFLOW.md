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
- [x] P5 Dispatches: rep raise → coordinator approve / refuse → target counting
- [x] P6 Manager view, admin, notifications
- [x] P7 Polish, acceptance runs, PWA, handover
- [x] P8 Depth — Jerom used it and asked for more (his list, added to SPEC §3 not replacing it)
      - [x] P8.1 Research, the identity decisions, and the view rulings written into DESIGN
      - [x] P8.2 Every list creates from itself; the missing-primary-action sweep
      - [x] P8.3 Semantic colour: state, overdue, stuck, ahead — one small set, both themes
      - [x] P8.4 m² is the headline on quotations and dispatches; price is the quiet one
      - [x] P8.5 The drawers reworked: what a person needs first, at the top
      - [x] P8.6 A dashboard per role, each answering that person's daily question
      - [x] P8.7 Views where they earn it: a board of states, a timeline of follow-ups
      - [x] P8.8 View as: the admin checks the app as any role or any person, marked
      - [x] P8.9 Roles beyond the four, if the business needs them — propose, record, build
- [ ] P9 Think, then deepen — Jerom's second pass after using it (adds to SPEC §3, replaces nothing)
      - [x] P9.1 Five days walked end to end, judged against the sheet, ranked list written here (9A)
      - [x] P9.2 The schema read as a critic and fixed while the data is still fake (9D)
      - [ ] P9.3 The daily report: the system writes most of it, the person adds what it cannot know (9B)
      - [ ] P9.4 Numbers that answer a question somebody asks daily, and say what they mean (9C)
      - [ ] P9.5 The login screen, and the identity audited as a whole (9E)
      - [ ] P9.6 The 9A list built, best first, and the ideas that only sounded impressive left out

P3.5 before P3.6 on purpose: P3.6's terminology sweep and its "one sentence per rejected input"
rule have to cover the edit screens too, and sweeping twice is how a second definition survives.

**Where I stopped:** P8 done. Jerom used Kladra himself and asked for depth rather than
features, and his seven notes were all one complaint said seven ways: the app told him what
records exist and not how anything is going. Every list creates from itself now and asks for
the parent when it needs one; colour carries state from one five-tone map with the raw hues
deleted so nothing can reach past it; m² is the headline and price the quiet line under it;
the drawers open on how a customer is going before what he is; each role has a screen that
answers its own morning question; quotations and dispatches have a board where a board earns
its place; an admin can look through anybody's eyes and write nothing while he does; and
marketing is a role of its own that owns companies, works them like a rep and stops at the
price.

Three of P8's defects were the shape P7 had already named — one rule kept in two places. The
company and project drawers still asked `repId === user.id` by hand, so they offered Log and
Edit while an admin was viewing as somebody, and the fix went into `mayWrite` where every
screen reads it. The action guards took the literal `"rep"` while the screens asked
predicates, which is how a manager could be offered a quotation button the server would
refuse; the guards take `FLOOR_ROLES` and `SELLING_ROLES` now and a spec holds both lists to
the functions they came from. And the View switch wrote `?view=` for the board but not for
the list, so pressing List left a bare URL, the cookie still said board, and the board came
straight back.

Two screens were caught saying nothing rather than something: marketing's day carried a month
card with no target behind it and a "waiting on you" band that can never fill, because
everything that waits on a person there is a quotation or a dispatch. Both are gone for that
role, which is the same sentence D44 already made about the team table.

Handing a company over is the piece that makes the role work, and it is one column: every
list is scoped by `companies.rep_id`, so the projects, quotations, dispatches and metres
travel with the customer and the log stays where it was written. It is also how a floor
survives somebody leaving, which had no answer before.

What is left is still the part Claude cannot do: Faisal, Rawan, Abdulrahman and Jerom using
it. The image builds and boots with no `.env`, and README.md is the handover.

**Where P7 stopped.** Every box was ticked and the specs passed in both locales.

P7's four defects were all one shape: a rule kept in more than one place. A manager and an
admin could edit, log against and archive any rep's records for three phases because the
code asked "may he touch this?" and got "yes, he is the manager" — seeing and writing are
two questions now (D42) and `tests/floor.spec.ts` asks both directly, since the defect had
no appearance on any screen. Five dialogs threw away the per-field half of a refusal and
put "Required" at the bottom instead of at the box (D43). Three copies of one filter chip
disagreed about what "selected" looks like, and the loud one was wrong. And the team table
and the targets screen disagreed about who carries metres (D44).

Two deploy defects were found by building the image rather than by reading the Dockerfile.
`next build` imports every route to read its config, so a pool opened at module scope built
here and died in a container with no `.env`; and `COPY /app/public` had no source, because
the repo had no `public/` until the PWA icons landed. `npm run check:build-env` now builds
with the environment blanked, and it was proved to bite before it was believed.

The Arabic was reviewed as prose, not as coverage: 43 strings changed. Three of them were
sentences addressing Rawan as a man, one was a feminine company restored with a masculine
verb, and four were a figure called two names on two screens. The review also found the
targets hint saying metres for a figure set in square metres.

Last came the class the review pointed at: a value dropped into a sentence carries no
direction, so a full stop, a colon or a «guillemet» beside it settles against the
paragraph. It is fixed once, where messages load, rather than at forty call sites (D46),
and two components that joined two names with a `·` got `<bdi>`. Screenshots then said the
Arabic thickness list read unit-first; a range measurement said it does not, and that
measurement is now a test — the third time a reviewer has read an RTL line left-to-right
and called it a defect.

P5's one real defect was found by its own test, which is what the test was for. The browser worked
out a dispatch's m² as `round(width × length, 2) × qty` and SQL as `round(width × length × qty, 2)`.
Thirty sheets of 1.24 × 5.8 came to 215.70 on screen and 215.76 in the database. Nobody would ever
report six halalas; they would stop trusting the figure. One function now does it on both sides
(D38, and a new rule in .claude/rules/data.md).

Two decisions beyond §3, both written down: a dispatch goes against the live revision of a
quotation and not a superseded one (D36), and there is no withdraw for a dispatch even though
there is one for a quotation request — the coordinator refuses it with a reason, which is the
conversation that was going to happen anyway (D37).

The seed gained one quotation: issued, latest revision, nothing sent against it. Every other issued
quotation in the demo had either been revised or already partly dispatched, so the ordinary state
a rep starts a dispatch from was the one state the demo did not show.

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

## §4 Five days, walked (P9.1)

Written before any P9 code. Every claim below was checked against the running app or
the database, not remembered. Counts come from the seeded floor, which is FACET's
shape at a smaller size.

**Faisal, a rep.** Opens on his day. The month, then what has come back to him and is
stopped, then who is owed a call with the phone number on the row. This is the part
that already beats the sheet: the sheet never ordered anything or aged anything. Then
the day breaks. He presses WhatsApp, has the conversation, comes back — and to write
one sentence about it he presses the row, waits for the companies screen, presses Log,
and types. Two of those five steps are navigation. If the customer wants a price he
opens the project and types a quotation line: colour, supplier, fire rating, class,
thickness, quantity, width, length, price. Nine fields, and this business sells the
same handful of specifications over and over, to the same customers. Nothing offers him
the last one. If he logs against the wrong company he cannot fix it — there is one
activity action, `log`, and no edit and no delete, so the correction is a second entry
that every count afterwards believes. At the end of the day he writes nothing at all,
because there is nowhere to write it. And two thirds of his floor is dark: **eight of
his twelve companies have been contacted once and carry no next step**, which puts them
on no band of his day, in no stuck list, and in front of nobody.

**Marketing.** The same day without the chain: calls, logs, follow-ups, and a handover
when a lead is worth a rep's time. Its day is thin and honest. The one thing it cannot
do from the screen it lives on is add a company, which is the thing it does most.

**Rawan, the coordinator.** Opens on her queue with her four figures, including the one
nobody else has — how many she has answered today. She issues in SMAC and types the
number back. Two things are missing at the point of action. The row does not say how
long that request has waited; only the strip at the top names the oldest, and she is
the person who can fix it. And **nothing stops her typing the same SMAC number twice**
— not the database, which has no unique index on it, and not the action, which never
looks. That number is the only link between Kladra and the system that holds the money.

**Abdulrahman, the manager.** Opens on the team: the company month, a row per person
with target, achieved, pace and pipeline, then what is stuck. This is the screen that
made the sheet redundant for him. What he cannot do is read a **day** — the screen only
knows months — so "what happened yesterday" is still a WhatsApp question. He cannot see
last month beside this one. He cannot see where quotations die, because the history is
not kept: a quotation carries only the instants it was created, issued and decided, so
how many times it was sent back, when, and by whom is gone, and the return reason is
never cleared once the rep has fixed it. And a rep on leave still shows red overdue
follow-ups on his screen; the pace arithmetic already knows about leave, the rest of the
screen does not.

**Jerom, the admin.** The manager's screen plus the admin menu, and viewing as anybody.
Nothing on it tells him whether the app is being used. Adoption is what kills a CRM, and
the one number that would say so — who has not opened it this week — is not there.

### The ranked list

Ordered by minutes saved per person per day, times how often the day contains it.

1. **The daily report.** Nothing replaces the one line a day, which is the single
   reason the sheet is still open. There is not even a query for "what did this person
   do today": activities are readable by company and by project and by nothing else.
2. **Companies with no next step are invisible.** Contacted once, no follow-up, on no
   band of anybody's screen. Eight of Faisal's twelve. This is the leak the sheet also
   had, and the one a CRM has no excuse for.
3. **A log entry cannot be corrected.** One action, no edit, no delete. A visit against
   the wrong company is wrong for ever and every figure built on it inherits the error.
4. **Logging costs a page load.** The day screen lists who to call and then sends him
   somewhere else to say what happened.
5. **A quotation's history is not kept.** Sent back twice or five times reads the same,
   the return reason outlives the fix, and "where do quotations die" cannot be answered
   at all.
6. **The same SMAC number can be typed twice**, on two quotations or two dispatches,
   with nothing objecting anywhere.
7. **Every quotation line is typed from nothing.** Nine fields, repeat customers,
   repeat specifications, and no way to start from the last one.
8. **The queue row does not say how long it has waited.**
9. **Leave is invisible everywhere except the pace arithmetic.** Nobody covers a floor.
10. **A revision does not say what changed**, so the coordinator re-issues blind.
11. **No month before this one, anywhere.**
12. **Nothing says whether the team is using the app.**

Half-built rather than missing: the standing strips answer "how is this going" for a
company and a project but for no person; notifications are created and never expire.

### Not building

Each of these was considered and dropped because it shortens nobody's day here.

- **Lead scores and win probabilities.** Fourteen people who know their customers by
  name do not need a machine's guess, and S46 already forbids one number that mixes
  target with activity.
- **A forecast.** Pipeline plus the rep's own judgement is what a manager acts on. A
  forecast is a number with nobody's name on it.
- **Email integration.** This team sells by visit and by WhatsApp. There is no inbox to
  integrate.
- **Territory maps.** Three reps, three regions, and everybody knows which is whose.
- **A store-built mobile app.** The PWA installs and works; a store build is months of
  work for the same screens.
- **More activity types.** Four channels is the right number. A longer dropdown is the
  failure mode the daily report has to avoid, not one to copy.

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

**Rawan-2 (coordinator, dispatches)** — `tests/dispatches.spec.ts`
1. Faisal opens an issued quotation and sends part of item 1, with a shipment method, a destination and payment terms. The m² adds up as he types.
2. The drawer that opens shows the same m², worked out again in SQL.
3. Rawan's Queue, open in another browser and never reloaded, shows the request arrive and her bell rise by one.
4. She opens it, reads how many are going against how many were quoted, and approves it with SMAC dispatch number 8810.
5. Faisal is told; it reads Approved with the number; the approved m² is on this Riyadh month, by the approval's own date (S41, S43).
6. The quotation now has that much less left to send.
7. Second test: a request for more than a line has left is refused at the field as it is typed, and refused again by the action — the second one is the enforcement that counts.

Faisal's Home target card (the old step 4) lands with P6, which is where the card exists.

**Abdulrahman (manager)** — `tests/manager.spec.ts`
1. Sign in as Abdulrahman. Home shows company target vs achieved and the team table.
2. Each rep row shows target, achieved, pace, open quotations, overdue follow-ups.
3. The Stuck list names the waiting request, the overdue follow-up and the never-contacted company.
4. Open Faisal's companies read-only; no Add company button, and — `tests/rep.spec.ts` — no Log, New contact, New project, Edit, Archive, Mark lost or Request quotation in either drawer, and the follow-up dates read as sentences rather than pickers (D42).
5. The bell lists his notifications; mark one read and the count drops.

**Jerom (admin)** — `tests/admin.spec.ts`
1. Sign in as Jerom. Home is the team screen, and the Admin section lists Users, Targets, Lookups, Holidays and leave, Archive, Export.
2. Create user "Majed" as rep; he signs in with the password Jerom read out.
3. Reset his password: the old one is refused, the new one works, and his open session is gone.
4. Deactivate him: he stays on the list marked Inactive, and cannot sign in.
5. Set Faisal's target for this month; the team table shows it.
6. Add a company category, take it out of use, put it back — and a rep is offered it in Add company.
7. Add a holiday later this month; Faisal's pace denominator drops by one and his elapsed days do not move.
8. Download all three exports: CSV, byte-order mark, CRLF, and an Arabic company name intact.
9. A rep archives a company; Jerom restores it from Archive and it is back on the floor.
10. Second test: a rep who types any `/admin` URL lands on his own home, and `/api/export/*` answers 404.

**On a phone** — `tests/pwa.spec.ts`
1. `/manifest.webmanifest` is served, names the app, opens standalone, and every icon in it is a real PNG on disk — including the apple one, which iOS reads from a link tag and not from the manifest.
2. The offline splash is a plain file and carries both languages, because there is no server to ask which one to use.
3. Signed in, cut the network: the splash appears instead of the browser's error page.
4. The cache is listed by name and holds exactly two files. Anything else in it is offline DATA, which SPEC §3 rules out.

**The floor rule** — `tests/floor.spec.ts`
One of two specs that are not a walk through a screen, because this rule has no appearance when it is wrong: `mayOpen` and `mayWrite` are asked directly, once per role, on a floor that is theirs and one that is not (D42). The five roles are asked the same way about
the four sentences that separate them — who owns companies, who may price one, who carries a
month, whose floor a company may sit on — and the role LISTS the action guards take are held to
those same sentences, so a screen and the server cannot answer differently (D50).

**Creating from a list** — `tests/create.spec.ts`
Faisal adds a project from the Projects screen, requests a quotation from the Quotations
screen and raises a dispatch from the Dispatches screen, choosing the parent in the dialog
each time and never leaving the screen he started on. Every one is checked against the
database: the project against the company picked, the quotation against both ids, the
dispatch against the quotation and the quantity typed. Rawan is offered none of the three,
because she owns no companies and a control she cannot use is not drawn (P8.2).

**Colour** — `tests/colour.spec.ts`
The mapping from a status to one of the five tones is asked directly, and then the
quotations and dispatches lists are filtered to one status at a time and every badge on
screen is read back through `data-tone`. Two chains, one meaning: a dispatch waiting on
Rawan is the same amber as a quotation waiting on her (DESIGN §6).

**What a row may contain** — `tests/schema.spec.ts`
The third spec that is not a walk through a screen, and it earns the exception the same way:
a quotation line with a zero quantity does not look broken, it looks like arithmetic. Six
attempts are made against the DATABASE with the app nowhere in the picture — a zero and a
minus in every measurement, the same quotation line twice on one dispatch, a SMAC number
typed onto a second quotation, a second main contact, a company given both a picked city and
a typed one, an issued quotation stripped of its instant and of its number, and a revision
pointing at a quotation that does not exist. Each must be refused (D52, D53). Nothing is ever
written, so there is nothing to clean up.

**Marketing** — `tests/marketing.spec.ts`
Marketing signs in and lands on a day with no month card, sees Companies and Projects in the
rail and neither chain screen, opens one of its own leads and is offered every piece of a rep's
work on it except the price — on the drawer and on the Quotations screen both. Then it hands the
lead to Faisal: the dialog asks who, says what travels with the company, and the move is checked
in the database and in the audit log (D50, D51).

**Words dropped into sentences** — `tests/isolate.spec.ts`
The other one, and for the same reason: it has no appearance until a customer is called "3M Arabia". Every `{placeholder}` in every shipped message, both locales, is checked to come out of the loader isolated — and the loader is checked to have added the two invisible characters and changed nothing else (D46). A plural branch is not a value and stays untouched.
