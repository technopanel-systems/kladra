# WORKFLOW — how Kladra gets built

## §0 Checklist and where I stopped

Phases 0–12 are done and their boxes are collapsed to a line each; the account of every box is
in this file's git history up to `e5c90cd`, and every decision it produced is in SPEC §4 and §5
below by number.

- [x] P0–P2 Toolbox · extract from FACET → the five files · scaffold (app, database, login, shell, seed, live, tests)
- [x] P3–P3.6 Rep floor · edit and archive · root causes (no disabled primary action, one word per concept, `kladra_test`)
- [x] P4–P7 Quotations · dispatches · manager, admin, notifications · polish, PWA, handover
- [x] P8 Depth after Jerom's first use — identity, every list creates from itself, semantic colour, m² the headline, the drawers, a dashboard per role, views where earned, view-as, roles (D1–D53)
- [x] P9 Five days walked; the schema read as a critic; the daily report; figures that answer a question; the sign-in screen; the ranked list built (D54–D77)
- [x] P10 The standing strip; a notice clears itself; the carried three; the pilot at volume (D78–D84)
- [x] P11 A–J Independent review as a stranger: seventy findings fixed at the cause (§5 #1–#153, D85–D145)
- [x] P12 First real user feedback (SPEC §3, P12): the hang and its class · the §3 gate · sharing · credit · roles · three tabs · leads · duplicates · quotations · dispatches · the queue · metrics · reports and the log as one thing · across (D146–D166, §5 #154–#205). Box 14's last three steps — the drawer shots, the namespace move, the guidelines pass — are closed by P13: the move is done in Stage 1, and the sweep (S12) shoots and reviews every drawer.

- [ ] **P13 Remake and polish, with nothing assumed** — the second round of real use (SPEC §3, P13). Three
      model stops and no others: Stage 1 plans, Stage 2 builds every slice, Stage 3 audits as a stranger.
      - [x] **Stage 1 (Fable)** — housekeeping, tooling, research, the plan; stopped once for approval.
            Artefacts were already ignored and untracked; the stray root snapshot went; seven dead files,
            three wrong dependency lines and two skills that did not earn their place went (§1); `check:dead`
            (knip) joined lint; the prompt files were audited for Fable and shortened; this file shrank from
            281 KB to what a session can read; the language is written (DESIGN §1b), the founder's round is
            in SPEC §3, and the slices below are the plan.
      - [ ] **Stage 2 (Opus, xhigh)** — approved by the founder with three changes, written into S0, S1
            and G6 below. Every slice, in the groups below; parallel inside a group where files do
            not overlap; the session integrates (spec3 registry, SPEC §4, DESIGN, §5) and runs the gate.
            A slice is green on typecheck, lint, build and its own specs; a group is green on the full
            suite before its slices are committed, one commit per slice. Every slice ends with shot-looker,
            arabic-reviewer, web-design-guidelines, the axe spec and the critic's pass.
            **How Stage 2 runs.** The session builds G1 itself — everything after it stands on the schema
            and the identity. From G2 on, up to three screen-builders run at once on disjoint files in this
            tree, each told the files and message namespaces it owns; none of them runs Playwright. The
            session runs each slice's specs one file at a time, integrates what several slices share (the
            spec3 registry, `common` messages, SPEC §4, DESIGN, §5), and runs the full suite once per group.
            - [x] G1 · S0 **Schema for the whole phase**, one migration set, and the least code that keeps the
                  gate green on it: a dispatch names its company and optionally its quotation and project, and
                  carries its own typed lines AND its own services — the same inputs as a quotation, each with a
                  nullable link to the quotation line or service it came from, so the difference flag compares
                  the whole thing (founder, P13 approval); `quotation_services` and `dispatch_services`; payment
                  terms merge credit and tasaheel; `raised_by_id` on quotations and dispatches; marketing sells and
                  carries metres (D168); a log entry takes an outcome from an admin lookup (D171), a kind from the
                  wider list, and an optional quotation or dispatch; `daily_reports` goes (D167); seed and
                  `tests/schema.spec.ts` follow. **Done** as migration 0025: a dispatch is a load with its own company, raiser,
                  typed sheet per line and services, a recorded difference exactly when it came from a paper;
                  services and outcomes are admin lookups; channels gained site visit and meeting. Two parts
                  moved to the slice that writes them, so no column lands without its writer (rules/data.md):
                  `daily_reports` goes and `outcome_id` becomes required in S4 (D174), and marketing's seat on
                  the floor is S5's. Service m² never counts (D173).
            - [x] G1 · S1 **The identity** (founder, P13 approval). First the "before" set: `scripts/shots.ts`, one
                  manifest of every screen, dialog, drawer, board, dashboard, list, form and empty state, per
                  role, captured into `shots/` at 1366 and 375, en and ar, dark and light — the same manifest
                  takes the "after" set in G6. Then three visual directions drawn from everything 13.1 studied
                  (Twenty's code, Attio and Folk's restraint, Linear's motion, the shadcn chart kit, the avatar and
                  hover rules in §1b), each a token set switchable on the dev server and rendered on three real
                  screens — the rep's home, the coordinator's queue, a quotation drawer — in both themes and both
                  directions. Palette, type scale, radius, elevation and density are open; kept whatever wins:
                  dark by default, one gradient on the primary action, calm. One is picked with its reason written
                  in DESIGN §1, its tokens set, the other two deleted, and the work carries on without a stop.
                  Then the primitives drawn in it: `Avatar` with rings, `Empty`, the static shaped `Skeleton`, the
                  hover and reveal utilities, `StickyScroll`, the chart kit (`npx shadcn add chart`), the avatar
                  tints in both themes, a `one-look` rule for each, and `tests/axe.spec.ts` walking every screen
                  for every role in both locales. **Done**: 344 "before" shots with no failure; Ember, Aluminium and Sandstone
                  rendered on the three screens in every theme, direction and width; **Sandstone** chosen for Readex
                  Pro, one family for both scripts (DESIGN §1 has the reason and the other two); the glass and the
                  canvas glow gone; `Avatar`, `Empty`, static `Skeleton`, `hover-tint`/`reveal`, `StickyScroll` on
                  the boards; one-look rules 9–13; axe clean on every screen in both locales and themes after two
                  contrast fixes. The chart kit arrives with the first chart (S7), because a kit file nothing
                  imports fails `check:dead`.
            - [x] G2 · S2 **Quotations** (13.4): the request dialog wide enough for the lines and the services — a
                  stated minimum on a desk, asserted by a test — and the services section with its own subtotal. **Done**: `ResponsiveDialog size="wide"` at `WIDE_DIALOG_PX` 1152 (the table's
                  thirteen columns at a readable width; lines are cards below 1280); the services section with
                  its subtotal in the form, the drawer, "what changed" and the CSV (a row per service, D173);
                  a withdrawn service is refused (D175). Left for others: the services list belongs with the
                  lookups (S3 imports it where it is); the searchable select's popup is only as wide as its
                  button inside the table (G6).
            - [x] G2 · S3 **Dispatches** (13.5): the request rebuilt per §3 — prefilled from the chosen or latest
                  issued quotation with its panels AND its services, editable, linked, flagged where either differs
                  (computed from the two sets by `quotation-diff`, recorded in the trail at the raise), or direct
                  for the company with its own prices (D169); refused is edited and resubmitted; payment
                  placeholders gone, the three-way choice. **Done**: the request rebuilt on the wide dialog — company, then where it comes from
                  (the latest issued paper chosen, another, or Direct), every line and service prefilled and
                  editable; `differenceFrom` on the server, recorded and named in the drawer, a chip on the list
                  and the queue (D178, D179); direct loads for the rep's own customers, credited through the
                  dispatch's company; refused loads corrected and sent again; payment three ways, no placeholder.
                  Request dispatch is offered to every seller who may write, and both drawers carry Add report.
            - [x] G2 · S4 **Reports** (13.8): one popup from anywhere — the top bar's `+`, and every drawer, prefilled
                  with what it was opened from — company, contact, what happened as buttons, outcome, text, next
                  follow-up, twenty seconds on a phone; the rep's view (his days, a calendar, filters by company,
                  kind and outcome); the manager's (the team by day and week, filters by rep, kind, outcome and
                  company, who has written nothing today, drill into a rep or a day); the coordinator's own as a rep;
                  the system's events in a marked lane beside the written ones, never mixed. **Done** as migration 0026 (`daily_reports` gone, an outcome required): `ReportDialog`
                  from the top bar, the bottom bar, the company and project drawers and the call cards (seven
                  presses and a line from the top bar, five from a record, D176); the rep's month with a calendar
                  and the "Recorded by Kladra" lane; the manager's day and week, filters, drill-in and "written
                  nothing today" (D177); glossary Report / Reports. The quotation and dispatch drawers get their
                  Add report when S3 is merged.
            - [x] G3 · S5 **Leads and marketing** (13.7): the lead form as §3 states it; the rep's band of leads given
                  to him above his companies, newest first, highlighted until acknowledged; the manager's leads view
                  with assign and reassign and the unacknowledged; marketing's outcome per lead — acknowledged,
                  contacted, quoted, won — derived from the company's own records; marketing a rep everywhere else.
                  **Done**: `carriesMetres` and `sells` include marketing, its home is the day and Leads third on
                  its rail; the lead form's one note is the query, a phone required, the duplicate warnings; the
                  band above a rep's companies with Acknowledge / استلام; the manager's leads view filters by who and
                  by state and reassigns from the row, and a hand-over from the drawer of an unanswered lead is the
                  same move (D181); the stage in SQL before the cap (D182). The seed has a lead at every stage.
            - [x] G3 · S7 **Lists and boards** (13.3): "All" first and default on companies, quotations and dispatches;
                  the projects board, Open · Quoted · Dispatching · Won · Lost (D170); `StickyScroll` on every board
                  and wide table; the archive rebuilt from its question — who opens it and what they do there.
                  **Done**: nothing remembered a narrowing filter, so All moved to the front of every chip row
                  (D184); the projects board from `src/lib/project-stage.ts`, one rule and its SQL twin (D170); the
                  kit's `Table` sits in `StickyScroll`, whose bar sticks under the top bar where the page scrolls
                  it, and rule 13 allows no other scroller; the archive is a search with one-press Restore (D183).
                  A lead nobody has acknowledged left the rep's list and strip (D185).
            - [x] G3 · S10 **Targets** (13.2): the current month only, editable where the admin sets it, history
                  read-only beneath. **Done**: no month to move to; the action refuses another month; earlier months
                  in a read-only table in `StickyScroll` (D180). Nothing else navigated months.
            - [x] G4 · S6 **The coordinator** (13.6): pending quotations and dispatches side by side from `lg` up; a
                  rep picker at the top of both request dialogs for her, counting toward him, hers under Internal
                  Sales when no rep is named; reliance per rep on the manager's team tab.
                  **Done**: two columns from `lg`; "For" first in both dialogs for her, the chosen person's own
                  readers below it and the action asking again, `rep_id` him and `raised_by_id` her, "Raised by" on
                  drawers and rows, his bell told (D190); `src/lib/reliance.ts` with its twin, the card on the
                  manager's metrics tab (D191) — wired once S9 has rebuilt that tab.
            - [x] G4 · S8 **Dashboards, the work tabs** (13.2): the target card at the top of the first tab on the day
                  and team screens, out of Metrics; today's cards in the auto-fit grid; the team tab rebuilt in the
                  language — avatars, rings for leave and stuck, a row that opens the person.
                  **Done**: the month opens both work tabs and the metrics tab has none (D187); the stuck groups and
                  the day's cards in the one auto-fit grid, `Empty` where a card can be empty, a `loading.tsx` on
                  both; the team row with its grey leave ring and red stuck ring, each with its word, the stuck
                  count taken from the stuck list's own aged rows, and the row opening the person's floor (D188).
            - [x] G5 · S9 **Metrics and the report builder** (13.2): pies and rings where a share is the point, each
                  slice a door to its list; the builder — measure, breakdown, period, rep — on the metrics tab, with
                  the table under the chart, CSV export for the manager and a print stylesheet; every question a
                  manager asks monthly answerable there.
                  **Done**: the kit's chart over Recharts; pies, rings and columns by the question each card answers,
                  every slice and bar opening its list through the figure's own predicate (D150, D192); the builder
                  with seven measures, five breakdowns, the table, CSV and print (D193); S6's reliance card on the tab.
            - [x] G5 · S11 **Edge** (13.9): an `edge` Playwright project on the msedge channel that runs only
                  `tests/edge.spec.ts` (D172), opening every menu, select, popover and palette on every screen in
                  both locales; the hypotheses in order — Edge's translation of the Arabic screens mutating the
                  portal (`translate="no"` on the shell if so), a modal menu dismissing a popover, Enhanced Security
                  mode, duplicated Radix internals (`npm ls`, clean today); fixed once in the kit, the rule in DESIGN §5.
                  **Done**: in a plain Edge every popup opened; it failed once Edge translated the Arabic screens —
                  React's text nodes rewritten, hydration broken, a select taking the screen down when reopened.
                  `translate="no"` on `<html>` (D194), cmdk rows keyed so none is empty; the `edge` project runs
                  `tests/edge.spec.ts`, every popup kind per role in both locales, and a translation regression.
            - [ ] **G6 · The front end, re-audited and reshaped** (founder, P13 approval) — its own group at the end,
                  as many slices as it needs, and it may take longer than the rest combined. Every screen, dialog,
                  drawer, board, dashboard, list, form and empty state opened as if never seen, and judged against
                  DESIGN §1 and §1b and the products studied — never against what an earlier phase built. Where one
                  falls short it is reshaped: layout, hierarchy, density, hover, avatars, motion, colour meaning,
                  empty and loading states, the phone. Rewriting a component is allowed; what was fine in P8 and is
                  merely acceptable now is rebuilt. The libraries adopted are used where they fit, each use recorded
                  in §1. Both themes, both directions, 375 and 1366, before beside after for every screen. Not done
                  until a stranger would say the whole product was built by one hand, this month.
                  - [x] S12.0 The cold inventory: every state in the shots manifest, per role, judged and ranked here
                        with what falls short of what, and the reshape each one gets — walked through `ux-patterns`'
                        `lens.md` (six states, the schema-browser smell, the lineup test), which every S12 brief cites.
                        **Done**: 44 states × 8 shots (`shots/now`), three cold readers, claims checked in code by the
                        session. One hand already: sign-in, missing, add company, new project, the report dialog, the
                        coordinator's day and queue, the quotations list, the rep's metrics, the team tab, leads, the
                        archive. Ranked, most severe first (owner):
                        1 · Every dialog, sheet and drawer blurs the page behind it (`backdrop-blur-xs` in the kit's
                            three overlays) — the glass S1 took out, on every overlay state. (K)
                        1 · A board at 375 is two columns and an edge that peeks, its header cut («SENT BAC»); on a desk
                            two of the quotation board's six columns are out of view with no sliver to say so. (K)
                        1 · Admin lookups: eleven kinds wrap to two lines at 1366 and four at 375 — `FilterRow` wraps. (K)
                        1 · The dispatch drawer has no figure strip and no m² at its head; the quotation drawer beside it
                            leads with both (P8: m² is the headline of both). (S12.5)
                        2 · Uppercase, tracked, 11px labels — the eyebrow §8 refuses — on `StandingStrip` (every drawer
                            head, the queue, team work, admin use), `Board` headers, and both totals blocks. (K, S12.4, S12.5)
                        2 · Avatars: none in the company, project, day, stuck, duplicate, users, targets, use and
                            holidays rows, and none at a drawer's head — while leads, the team tab, the archive and the
                            targets history draw them (§1b: 24 in a row, 40 at a drawer's head). (every slice)
                        2 · A record's trail comes last in the quotation and dispatch drawers; §6 puts it under the
                            actions. (S12.4, S12.5)
                        2 · The action that ends something stands at the weight of Edit: Archive (company), Mark lost
                            (project), Withdraw (quotation), Deactivate beside Edit and Reset password (users). (S12.2,
                            S12.3, S12.4, S12.9)
                        2 · The search palette opens blank — no recent records. (S12.1)
                        2 · Duplicates: Keep this one is the brand button on both sides of every pair. (S12.8)
                        2 · The quotation request's Width cell reads «1…» at 1366. (S12.4)
                        3 · Off-scale `text-[Npx]` across the shell; a tooltip that fires at 0ms; `transition-all` in
                            the kit's button, badge and tabs; an idle filter chip with no edge; the error screen's
                            gradient spelt differently from `brand-grad`. (K, S12.1)
                        3 · An unread notification is told apart by a dot alone; sign-in greys its button while it works
                            (busy is not disabled). (S12.1)
                        3 · Reports: the Recorded-by-Kladra counts are not doors, the calendar's figure has no word, two
                            filter rows with nothing to say they are two. Lead form: three groups, three treatments. (S12.8)
                        3 · Archive: "Folded into …" names a company and is not a door. (S12.9)
                        Questions left to the slice, not findings: a won project's past follow-up still reads red
                        (`pendingFollowUpSql` clears only a lost one) — S12.3 decides whether a won job's date still
                        chases anyone; two of team work's five figures carry no tone — S12.7 checks it is deliberate.
                        Every state shot only loaded: each slice shoots its empty, refused, loading and offline states.
                        Waves (≤3 builders, no file in two): 1 · K, S12.1, S12.9 — 2 · S12.2, S12.3, S12.8 —
                        3 · S12.4, S12.5, S12.6+S12.7 — then S12.10.
                  - [x] S12.K The kit, first, because every slice stands on it: the three overlays without blur, exits
                        faster than entrances, named transitions; tooltips at 300ms; the figure label in sentence case
                        on the scale; the board one stage at a time on a phone with a stage picker and a sliver on a
                        desk; a filter row that scrolls in one line; an idle chip with an edge.
                  - [x] S12.1 The shell: rail, top bar, bottom bar, search palette, bell and notifications, sign-in,
                        error and missing screens, the view-as banner.
                  - [x] S12.2 Companies and contacts: list, strip, drawer, forms, hand-over, share, archive.
                  - [x] S12.3 Projects: list, board, drawer, forms, lost.
                  - [x] S12.4 Quotations: list, board, the drawer rebuilt, request dialog, history, revision.
                  - [x] S12.5 Dispatches: list, board, drawer, request dialog, trail.
                  - [x] S12.6 The coordinator's desk.
                  - [x] S12.7 The rep's day and the manager's three tabs, metrics and the builder.
                  - [x] S12.8 Reports, leads, duplicates.
                  - [x] S12.9 Admin: users, targets, lookups, holidays, use, archive, export.
                  - [x] S12.10 The stranger's pass: every state again, before beside after in one contact sheet for
                        Jerom; whatever still reads as another hand is reshaped here.
                        **Done** (2026-09-15): first the founder's three-times-reported stock form — the request
                        dialogs' lines are items (`LineItem`, `FormSection`, `FormSplit`, D205) — and an Arabic name
                        for every demo person; then the whole manifest, 111 states × 8 (`shots/s1210`), read by three
                        cold readers. Fixed centrally: placeholders one tier below labels (faint, dark token #99948f
                        for 4.5:1); Customer rejected and a project's unsharing in the tint; admin's attribute words
                        unboxed; manifest rows that opened the wrong record. Read and kept, with reasons, in
                        `.claude/UX-RESTYLE-PROGRESS.md`. Contact sheets sent. Full suite 815 passed, 4 skipped, one
                        worker crash green on rerun.
      - [ ] **Stage 3 (Fable)** — audit everything as a stranger, refix, push, report; `/cost` at the end.
        Pushing is no longer held for Stage 3 (founder, 2026-09-15): forty-four commits on one machine were the
        risk, not an origin that has not been audited. `main` was pushed at cfa0de2 and is pushed after each green commit.

- [ ] **P14 The third round of real use** — the founder's decisions of 2026-09-20 (SPEC §3, P14). Each
      a slice a person could try, each green and committed and pushed, each ending with shot-looker,
      arabic-reviewer, web-design-guidelines, the axe spec and the critic's pass. P13's Stage 3 follows
      them rather than the other way round, so the stranger reads what the third round left.
      - [x] 14.1 The manager sees a request the moment it is raised, not two working days later (14B),
            and every other delay of that shape is asked whether waiting helps anyone — answers in SPEC §4.
            **Done.** Every request on the coordinator's desk is on his awaiting card from the
            morning it is raised, and a load waiting to be approved is one of them — it was on no
            screen of his. The two-day line survives where it means something: what turns a row
            and the card's dot red, and what counts on a person's row (a ring on everybody is a
            ring that says nothing). The figure above the card is the whole desk and its caption
            says how many are past the line, in the sentence her own screen carries.
            `tests/awaiting.spec.ts`, both locales.
      - [x] 14.2 A marketing lead's source is Marketing, fixed and not chosen (14D).
            **Done.** The lead form states the source and does not ask: marketing is the one
            bringing the lead in, so the list had one right answer on it and every other answer
            lost marketing its own credit. The action reads the restricted row itself and nothing
            is posted from the form — a hidden field that decides where the business came from is
            the same defect one layer down — and it refuses out loud where that row is gone. The
            word is still shown, because the rep who opens the customer tomorrow reads it too.
      - [x] 14.3 Every board and wide table: the scrollbar clear of the card titles, drawn for both
            themes instead of the browser's own (14G).
            **Done.** The kit keeps a rail's worth of room at the top of every wide surface —
            inside the scroller, so the bar's arrival still moves nothing — and hangs the bar in
            it on an opaque band, because a sticky bar travels over the cards as the page scrolls
            and an inherited background over a page that paints nothing let the words read through
            it. The rail itself is drawn: thin, round, in the theme's tokens, with
            `scrollbar-color` so Windows stops fading it out. Every board, every wide table and
            the chip lines take it from one utility.
      - [x] 14.4 Edge: every popup scrolls, fixed at the cause, held by the Edge project (14F).
            **Done.** The cause was the page's scroll lock: a dialog cancels any wheel that did
            not start inside its own subtree, and a popover is portalled to the body, so a list of
            two hundred countries opened and the wheel did nothing to it. The popover stops the
            event at itself — through a callback ref, because an object ref is still empty when
            the effect behind Radix's mounting would use it. Radix's select viewport is the one
            scroller in a Select now (the popup around it clipped instead), every popup list
            contains its overscroll, and each wears the same rail as a board.
      - [x] 14.5 A paper may name more than one warehouse — the quotation, the dispatch, and the
            difference flag that compares them.
            **Done.** Migration 0028 gives each paper a table of the stores after its first; the
            first stays on the paper's own column, required, so "every paper names at least one"
            is still the database's promise, and one file reads and writes both halves. The field
            is the field it was — one picker — with a quiet "Add another warehouse" under it that
            stops offering at the third; a store already named is not offered twice. A load opens
            on its paper's whole list, and the difference flag compares the two lists as sets, as
            one entry about the load with no line number on it. The seed prices q11 out of two
            stores, sends d7 out of one of them so the flag has somewhere to be read, and takes a
            direct load out of two. The CSV writes them in one cell.
      - [ ] 14.6 SMAC registration is a tick: the rep's belief, the coordinator's authoritative answer
            while she quotes, who ticked it and when, and her list of what is not registered yet.
      - [x] 14.7 A zero target earns no share of any paper unless the admin ticks it beside the target,
            and that is said wherever credit is chosen.
            **Done.** Migration 0027 puts `shares` on the target row. The credit pool is filtered
            to the people who may earn this month — a target above nought, or the tick — so a
            zero-target rep is not an answer to "counts for", is not part of a split, and a paper
            he raises is written with no credit rows at all. Where the question would have been
            the form says so in words, and names anybody on the job whose metres will not count,
            because a name quietly missing from a list is the wondering the founder asked to stop.
            The admin's tick sits beside the box it depends on; the seed leaves Turki support this
            month so the state is on the floor.
      - [ ] 14.8 Archiving is a request with a mandatory reason that the sales manager approves or
            refuses, one path for everything archivable, pending in his awaiting section.
      - [x] 14.9 Holidays and leave as periods, a month read at a glance, and both that tab and Users
            open to the sales manager with what he may not do written in SPEC §4 (14E).
            **Done.** No migration: a day off is still a row a day, because that is what pace,
            the reminders and the daily report count — the screen groups them. Consecutive days
            for one subject are one entry with its dates and its length in WORKING days, a
            weekend or a company holiday inside it no break at all; it expands to its days and a
            day inside it still goes on its own. Above the list is one month at a glance, its
            month in the address, saying what the shade and the dot mean in words as well as in
            colour. Both tabs open to the sales manager through one predicate that the page gate
            and the action guard share; whose account he may not touch is the same predicate
            again, asked of the held row at the moment of the write. D209 and D210 say what he
            may not do.
      - [ ] 14.10 Export everything, each from the screen it belongs to and carrying that screen's
            filters, both languages, 04/Aug/2026 dates, numbers Excel reads as numbers, Arabic intact (14H).

**Where I stopped.** Stage 1 is done and approved (founder, P13): a dispatch carries services as well
as panels so the flag compares the whole thing; S1 grows into the identity itself, three directions
on real screens and one chosen without a stop; the last group is a full re-audit and reshaping of the
front end. The six other defaults stand as D167–D172. "12D" was a heading in the founder's brief and
everything it held is built or in S2. G1 is done: S0 (0025) and S1 (Sandstone). G2's three slices are merged (S2, S3,
S4) with their review fixes (D186). G3 (S5, S7, S10), G4 (S6, S8) and G5 (S9, S11) are merged with their review fixes
(D181–D194) and two Arabic passes over every namespace they touched; their full suite is green (the two failures it found
were tests reading Arabic the reviewers had reworded: «المبلغ» now also begins «المبلغ كاملًا», and a per-cent sign beside an
isolated figure is said as «بالمئة» because it would read «%17»). Before G6 the founder sent designmotionhq's Blueprint PDF and
site; its 76 free patterns, the PDF, the public framework of its paid plugin (not bought), its shorts and the standards behind
them are read, and kept as the `ux-patterns` skill with DESIGN §8 saying what was taken and refused.
G6 starts with S12.0, the cold inventory, read from a fresh `shots/now` set against DESIGN §1, §1b, §6 and §8 through the
skill's `lens.md`. Wave 1 is merged: the kit (S12.K), the shell (S12.1) and admin (S12.9). Admin's row menu, the confirm it
opens and the arrived flash then moved into `ui-ext` (`RowMenu`, `ConfirmDialog` with a hosted `open`, `useOpener`,
`useRowFlash`) so the drawers of wave 2 share one of each. The wave's full suite is green: its two failures were one test
still pressing an Edit button that now lives in the user row's menu. Wave 2 (S12.2, S12.3, S12.8) is merged and green,
each built in its own worktree on its own port and database, because the suite on 3101 clears whatever database stands behind it.
Then the founder's restyle brief (2026-09-14) came in, with "any design rule that refuses the restyle is not absolute":
Sandstone became **Stone** (DESIGN §1: near-neutral surfaces, a flat red, no gradients, Plex Sans with Noto Sans Arabic, a
wider type scale, no card shadow, a state as a dot and its word), the rules it met were audited and recorded (DESIGN §8), and
the kit was restyled before wave 3 (S12.4, S12.5, S12.6+S12.7) was built on it and merged; SPEC §4 holds the G6 defaults as
D195–D204. A consistency pass over 20 core states in all eight variants fixed what repeated, in the kit, and the last full
suite is green (five failures, each fixed or green on rerun). Progress, decisions and known issues:
`.claude/UX-RESTYLE-PROGRESS.md`. On 2026-09-15 the founder overruled holding the push for Stage 3 and `main` went to
origin; before S12.10 come the quotation request's line editor (reported three times as a stock form) and an Arabic name
for every demo person. S12.10 is done: the line editor rebuilt as items, the seed's names in Arabic, the whole manifest shot and read, what
repeated fixed in the kit, and the before-beside-now sheets sent to the founder. **Stage 2 is over**, and on 2026-09-20 the founder sent the third round of real
use — ten decisions from the floor (SPEC §3, P14) — to be built before the audit, so P14 above comes first and
Stage 3's `/audit` reads what it leaves. Open for the founder: a fire rating's «Normal» has no Arabic (a lookup with one name column), and avatar tints
are a hash, so two colleagues can share one (DESIGN §1b). When the machine is
short of memory the full suite runs as four `npx playwright test` calls over a quarter of `tests/*.spec.ts` each, a
fresh test server for each, because one seventy-minute run was killed twice. The dev database is `seed:demo` on 0026; `seed:volume` after
it puts the volume back. A dev server that has served a session's edits is restarted, not reused.

## §1 Toolbox — what is installed, and why each earns its place

| Skill · tool (source) | For |
|---|---|
| find-skills (vercel-labs/skills) | Searching the registry when a capability is missing. |
| frontend-design (anthropics/skills) | Aesthetic direction, so screens do not read as shadcn defaults. |
| vercel-react-best-practices (vercel-labs) | React 19 and Server Component patterns. |
| web-design-guidelines (vercel-labs) | The review at the end of every slice: accessibility, focus, contrast, motion. |
| next-best-practices (vercel-labs/openreview) | Next 16: caching, server actions, proxy, route handlers. |
| shadcn MCP (`.mcp.json`, `npx shadcn mcp`) | The registry itself — search, read and add items (the chart kit in S1) — replacing the shadcn skill, which only described it. |
| knip (`npm run check:dead`, in `lint`) | Dead files, unused exports and wrong dependency lines. Its first run found seven files nothing imported, a dependency only a comment named, and three packages used directly but never listed. |
| @axe-core/playwright (`tests/axe.spec.ts`, S1) | One spec walks every screen for every role in both locales and fails on a WCAG 2 A/AA violation; scoped to the screen, Radix's known false positives disabled by name with the issue beside each. |
| Playwright `edge` project (S11) | `channel: "msedge"` against the installed Edge, running only `tests/edge.spec.ts`, so the matrix gains Edge without tripling the suite. |
| shadcn chart + recharts (S1) | Bars, pies and rings drawn in the language (DESIGN §1b). |
| ux-patterns (project skill, `.claude/skills/ux-patterns/`, P13 before G6) | The lens G6 reads and builds with: designmotionhq's 76 free pattern breakdowns and their videos, its Blueprint PDF, the public framework of its paid plugin, its shorts, and the standards behind them (WCAG 2.2, NN/g, Material 3, Apple HIG), each held against DESIGN — what confirms a rule, what adds a number, what is refused and why (DESIGN §8). `lens.md` is the walk every state gets; `notes/` keeps every reading so nothing is read twice. |

Removed in P13, with the reason: **playwright-testing** (24 KB of generic page-object advice that
contradicts `tests/helpers`' fixture style; the house style is the helpers and §3) · **shadcn skill**
(replaced by the MCP server above). Refused: **Lighthouse CI** (duplicates `measure:speed`, D133, and
needs a second Chrome and a puppeteer login for a database session; axe covers accessibility) ·
**Playwright pixel baselines** (hundreds of PNGs per locale × theme × width is the artefact problem
13.0 cleared; before/after is shot-looker's job, kept in the scratchpad and shown as a contact sheet) ·
**Origin UI** (an avatar copied from a registry is code we own anyway; `Avatar` is specified in §1b) ·
**Magic UI number ticker** (repeating motion that says nothing the figure does not).

Agents: shot-looker (sonnet) · screen-builder (inherit) · test-runner (sonnet) · arabic-reviewer
(opus). Hooks `guard-writes.mjs` H0–H9, `guard-bash.mjs` H11–H12; rules in `.claude/rules/`.

**Who runs on what.** Bounded, mechanical work with an exact file list — an inventory, a spec written
and run, a screenshot read, a research reading — goes to sonnet. Building goes to the session's model or
screen-builder with the files it owns. Judgement — a cause, a rank, a refutation, a design, a rule —
stays in the session; Arabic register stays with arabic-reviewer. The session reads the authority files
once and passes the extract in the prompt; never more than three agents at once, one writer per file,
and a read the session can do in a few `grep`s is not an agent's job.

## §2 The charter — how this gets built

**I own this system.** Not a task list being executed. FACET failed because its interface was
record-first, still, and built to be verified rather than used, and fourteen people went back to
a Google Sheet. I know that business, and I know Faisal, Rawan, Abdulrahman and Jerom by name.
From here I decide how Kladra gets built.

**Authority.** Change, delete or rewrite anything already built — whole phases, the schema, the
shell, my own earlier decisions, DESIGN.md, this file. Search the web when unsure; never guess an
API that can be checked. Add, remove or replace skills, MCP servers and libraries when they help,
and record each in §1 with its reason. Delegate bounded work to subagents (§1 says who runs on
what), one writer per file, never a third-party framework or swarm. Pick defaults without asking
and record each in SPEC §4 as "DEFAULT — founder may change".

**The one limit.** SPEC §3 is what real users asked for. An item there may be overruled only by
writing in SPEC §4 what was observed and why the users' version does not work. Never delete one
silently.

**Fix causes, not symptoms.** Every defect gets two questions: where did this originate, and where
else does it live? Sweep the whole system for the same cause, fix all of it, write the rule in
DESIGN.md, and add the Playwright test that makes reintroducing it impossible. Fixing one site is
not finished.

**A slice is done when** a person could try it: schema, query, server action and screen exist in
both locales; its WORKFLOW §3 script runs green; shot-looker has read it at 1366 and 375, en and ar,
dark and light; arabic-reviewer has read the strings; the guidelines and axe passes are clean; and
the checkpoint audit has read it as a critic — does it make a rep's day faster than the Google Sheet
did, is any of it record-first, is a rule now wrong. Then tick the box, update "where I stopped",
commit, and start the next slice. After a model change the audit is broader: the previous model's
work is another developer's.

**Reporting.** A few lines to Jerom at the end of each slice — what he can now try, in words he
would use — and a full report at the end of a stage. Between those, work; do not ask permission for
what the charter already grants.

**Before every commit:** `npm run typecheck && npm run lint && npm run build && npm run test`.
If a slice cannot get green, cut scope inside it, note the cut in §0, commit green. The suite takes
about thirty-five minutes and seeds a floor dated to the day it starts, so do not start one near
midnight. Only one suite runs at a time — `globalSetup` refuses a second — and stopping a run means
`taskkill /PID <pid> /T /F` on the `npm run test` process, because on Windows killing the shell in
front of it leaves the server and the browser running.

**Guards** are in CLAUDE.md: compose project `kladra` only, FACET read-only, retry Docker, commit
locally when the push fails. A build run deploys nothing.

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
4. Rawan sends it back with a reason. Faisal is told, reads the reason, changes a price and asks again — and the notice that brought him there is gone from his screen, because he did what it asked (D79).
5. Rawan issues it with SMAC's number. Faisal marks it Customer accepted, then raises a revision: it is Q-n/2, the first is Superseded, and the revision says which one line it changed and what the price was before.
6. The drawer says what happened to it, in order and in his language — requested, sent back, lines edited, issued, accepted — and her reason left the screen the moment he fixed it.
7. Rawan's own screen then holds one of each kind of notice: the customer's answer, which is finished, and the revision he has just raised, which is not. She marks everything read; the first stops being a row for ever and the second stays exactly where it is. The rep in that sentence is named in the script she is reading, because the row carries his id and never his name (D68, D79), and the customer is named in it too, from the notice's subject (D110).
8. Second test: a request the seed sent back twice says so, both her reasons are readable, and each line names her.
9. Third test: a repeat ask at a customer already quoted opens on that quotation's items in one press, the offer leaves once there is work to lose, and a new item opens on the sheet above it.
10. Fourth test: Faisal withdraws a request of his own. It leaves Rawan's queue and stays readable, marked Withdrawn.

**Rawan-2 (coordinator, dispatches)** — `tests/dispatches.spec.ts`
1. Faisal opens an issued quotation and sends part of item 1, with a shipment method, a destination and payment terms. The m² adds up as he types.
2. The drawer that opens shows the same m², worked out again in SQL.
3. Rawan's Queue, open in another browser and never reloaded, shows the request arrive and her bell rise by one.
4. She opens it, reads how many are going against how many were quoted, what other dispatches already hold and what is left once this one is counted (D112), and approves it with SMAC dispatch number 8810.
5. Faisal is told; it reads Approved with the number; the approved m² is on this Riyadh month, by the approval's own date (S41, S43).
6. The quotation now has that much less left to send.
7. Raising a second dispatch against the same quotation opens on NOTHING the first one said — the site, the terms and the shipment method are empty, and so are the quantity boxes. Nothing is ever carried forward from a previous record (§3, D160, overruling D81); the only field with an answer already in it is the store, which comes from the quotation itself.
8. Second test: a request for more than a line has left is refused at the field as it is typed, and refused again by the action — the second one is the enforcement that counts.

**The metrics tab (P12)** — `tests/metrics.spec.ts`
1. Faisal's day opens on his work: the report line if he owes one, his month, what is waiting on him, then the calls. The six-month bars are not on it.
2. He presses Metrics. The bars are there, and under them where his quarter's metres went by kind of customer, largest first, each row saying what share of the metres on the screen it is; beside it, how his work narrows — of the projects he started in the window, how many were quoted, and of the quotations he raised, how many went out.
3. The three windows are chips and the middle one is live on arrival: this month · the last three months · this year. Pressing one changes every figure BELOW the chips, and the address changes with it, so the link he copies opens on what he was reading. What is above them is not windowed and cannot be — this month against its target, and the six months behind it (D154).
4. He signs out; Abdulrahman opens the same tab and sees the whole company, plus a picker of the people on it — a dropdown and not a row of chips, because fourteen names wrap into three lines and push the figures under the fold, which is what the tabs were drawn to stop. Picking Faisal gives back exactly the figures Faisal saw for the same window, and keeps the window while doing it — the same question asked of the same rows, from two screens.
5. Every figure on the tab carries a sentence saying what it is a share OF, and no figure on it is one somebody typed.

**Two reps on one customer (P12)** — `tests/sharing.spec.ts`
1. Faisal opens Anmaa and puts Saad on it. Saad is told, and the drawer says who else is on it.
2. Saad, who has never seen this customer, opens it from his own list: the whole company, its contacts, its projects, its quotations and its dispatches, all readable and none of them his.
3. Saad adds his own contact at that customer — the same person Faisal already holds, because they have both met him — and it is his, beside Faisal's, and neither is a duplicate. Faisal's main contact stays Faisal's; Saad's is his own.
4. Saad tries the work he has not been given: no project of his own on that company, no log against it, no quotation. The buttons are not there, and the actions refuse it.
5. Faisal puts Saad on the tower. Now Saad raises a quotation on it, and it is his; Faisal sees it and cannot edit it.
6. Faisal takes Saad off the company. The tower goes with it — a job he cannot see the customer of would be a permission pointing at nothing — and Saad's own contact and his own quotation stay exactly where they are, because they are records of work that happened.
7. Second test, the hand-over that collides with all of the above: Abdulrahman gives a company to the rep who already holds his own row for one of its people. It goes through; the new owner's own contact stands, still his main one; the arriving duplicate is archived where it is and keeps the name of the rep who wrote it; and nobody ends up with two main contacts on one customer (§5 #159, D153).

**The three roles §3 rewrote (P12)** — `tests/roles.spec.ts`, `tests/floor.spec.ts`
1. Faisal adds a company. The lead source list offers him everything except Marketing; marketing signs in, opens the same form, and is offered it. The rule is a column on the row, so the admin renaming the lookup in either language does not switch it off.
2. Faisal opens one of his own customers and looks for Hand over. It is not there. Abdulrahman opens the same customer and it is, and moving it is audit-logged with both names (`tests/marketing.spec.ts`).
3. Rawan signs in. Her sidebar carries her desk first and her floor after it, and the primary action on Quotations says **Issue quotation**, not Request — because a request of hers would be a note to herself.
4. She presses it, picks her own job, types one line and the number SMAC gave it, and presses Issue. The quotation exists and is issued in one act: the trail says Requested then Issued, both hers, the drawer says Issued and says it was issued by the person who raised it, and no request landed in the queue she runs.
5. Abdulrahman opens the team tab. Her name is a row on it, with a target of her own and the metres against it — not the row of dashes she carried for eleven phases.
6. She presses Ctrl+K and types her own customer's name: it opens in the drawer, like a rep's. She types somebody else's and it opens the quotations screen filtered to that name, because the drawer would refuse the row. Her own customer's people are findable there too, and nobody else's are.
7. Faisal is handed a company marketing filed under its own source. He edits its notes and saves: the picker says what the company says rather than "Choose…", the save goes through, and the source has not moved. Jerom opens Lookups and that source carries a badge saying whose it is.

Faisal's Home target card (the old step 4) lands with P6, which is where the card exists.

**Marketing's own module (P12)** — `tests/leads.spec.ts`, `tests/marketing.spec.ts`
1. Marketing signs in and lands on Leads. Its Companies screen no longer offers Add company at all, and its floor is still there under it — the rows, the search, the day, the report.
2. It presses New lead. The form is the company form plus the two things a lead has: what the customer asked for, in his own words, and whose floor it lands on. The Marketing lead source is offered here, which is the form §3 moved it to.
3. Save. One act: the customer is on Faisal's floor, his own contact row carries the phone number, and the leads screen says the lead is not acknowledged.
4. Faisal signs in. It is the first row of "Waiting on you", badged **New lead**, with the customer's own question under it, and the pill above says how many. He has no Leads screen and his rail carries no link to one; typing the address puts him back on his day.
5. He opens the customer. The drawer says who passed it and what they asked for, in amber, above the tabs. He presses Acknowledge: the toast says the customer is his, the row leaves his day, the notice leaves his bell, and marketing is told.
6. The leads screen now shows that one as acknowledged with the day, and marketing's own two — the ones it kept — beside them.
7. Abdulrahman opens the team screen. The lead nobody has answered in more than two working days is a group on his stuck list, under a line that says what "too long" means, with the name of the floor it is sitting on.

**Two records, one customer (P12-8)** — `tests/duplicates.spec.ts`, `tests/schema.spec.ts`
1. Saad opens a customer whose telephone number Faisal already holds. He types the name the way he heard it — no مصنع in front of it, no definite article, ة written as ه, a fatha on one letter — and the warning under the field names Faisal's company anyway. It is advice: Save is live and he presses it.
2. The company is on his floor, whole, with his own contact row and the number on it. Nothing was withheld and nothing asked him a question (S15).
3. He types the address of the duplicates screen and lands back on his day. An open flag is a question about whose customer this is; he cannot answer it and is told nothing about it.
4. Abdulrahman signs in. The first band on his own screen is Duplicates, and its rows carry the customer and the two people holding a record each. The screen behind it draws the pair side by side: the same fields in the same order on both sides, the number that raised it above them, and how long it has waited.
5. He presses **Keep this one** on Faisal's side. Saad's record becomes a tombstone pointing at Faisal's; Saad's own contact moves across and stays Saad's; Saad gains no access to the customer.
6. On another pair he presses **Keep this one, and share it**: the same fold, and Saad is on the survivor's share list — he opens the drawer and reads everything under it, and the record is still Faisal's.
7. On the third he presses **Not the same company**: both records stay exactly where they are, and the pair is never raised again — the index allows one row per pair for ever, whichever way round the detector offers it.
8. Turki opens the record the manager folded weeks ago. It says what it became and who holds it. On the admin's archive screen it says the same thing and carries no Restore button, while the company archived for a reason keeps its own.

**A store, a name on the paper, and the chain (P12-9)** — `tests/create.spec.ts`, `tests/schema.spec.ts`
1. Faisal opens Quotations and presses the one button on it. The first field asks which CUSTOMER, not which job: the job field says "Choose a customer first" and will not open until he has answered.
2. He picks the customer. The job list is that customer's jobs and nothing else — it was every job in the building, with the customer as a quieter line under each.
3. He picks the job, then the person at the customer the paper is for, then the store it is priced out of. It opens on Riyadh, and he changes it, which is the only way anybody proves a field is a field.
4. The line asks its nine boxes in the founder's order and **Qty is fifth**, before Thickness and Width — the order §3 dictates and the form had drifted out of. He opens the width list, which offers 1.24, 1.5 and 2.0, picks 1.5 and types a quantity.
5. Save. The drawer names the store and the person; the row carries the customer, the job, the contact and the warehouse that were picked, and the metres are width × length × qty of what he actually typed.
6. He raises a dispatch against an issued quotation. The store opens on THAT QUOTATION's store, because the price was worked out of it — a child reading its own parent, never the dispatch before it. The dispatch drawer says which store the load leaves from, above how it travels and where it is going.
7. The database refuses a quotation or a dispatch with no store on it, and a store that is not a store: there is no price out of nowhere and no load from nowhere.

**How the load is paid for, and a refusal that can be answered (P12-10)** — `tests/dispatches.spec.ts`, `tests/create.spec.ts`, `tests/schema.spec.ts`, `tests/colour.spec.ts`
1. Faisal opens Dispatches and presses the one button on it. It asks which CUSTOMER first: the quotation field says "Choose a customer first" and will not open until he has answered. He picks the customer, and the papers offered are that customer's, each with its job under the number.
2. He picks one, types a quantity on a line that still has room, and answers how it is paid for. **Bank transfer** asks a second question in its own words — the full amount, or part of it. **Cash** asks a different one — on delivery, or at the office. **Credit** and **tasaheel** ask neither and make the note mandatory, because finance reads it; saving without it is refused at the field.
3. The form opens on nothing it inherited. The site, the terms and the shipment method are empty however many loads have gone out against this paper before (§3): the only thing filled in for him is the store, and that comes from the quotation the price was worked out of.
4. Save. The drawer says how it is paid for in words, and the quotation behind it now says **Accepted** — sending goods against a price is the customer's answer, and nobody had to remember to record it a second time. The chase notice about that quotation is off his bell.
5. Rawan opens the queue and refuses the request with her reason. It goes to Faisal's day, in the same amber a quotation she sent back wears, with her words on it.
6. Faisal opens it and presses Edit — the same form that raised it, not a new one. He corrects the quantity and sends it again. The request is back on her desk, her reason is gone with the state it explained, and the trail carries the whole story: raised, refused, corrected, waiting.
7. Her figure counts what she DID today, so the refusal is still in it after he has fixed it, and his resubmission counts as work arriving. Both come off the audit log, so neither can move because somebody else touched the row afterwards.
8. The database refuses the shapes the form refuses: a second answer where the terms ask none, the wrong second answer for the terms, a missing note where finance needs one, a note of nothing but spaces — and a quotation with no job at all.

**The whole row is the door, and SMAC's number leads (P12-11)** — `tests/presses.spec.ts`, `tests/smac.spec.ts`
1. Rawan opens the queue and presses a quotation row at its far END — how long it has waited, about nine hundred pixels from the number. The drawer opens. She does the same on a dispatch row and gets the dispatch drawer, not the quotation one.
2. On the customers list a row has a number on it. Pressing the number is still pressing the number — it is the one thing that lifts itself out of the door — and pressing the city beside it opens the customer.
3. Faisal opens Quotations. A quotation the customer is holding leads with SMAC's number and says Kladra's own quietly under it; a request nobody has issued leads with Kladra's alone, with no empty second line to read past.
4. Dispatches reads the same way, and the load names the quotation it is against by SMAC's number too — the number she would type into SMAC — with Kladra's under it.
5. On his phone the same records are cards and lead with the same number; on the board a tile carries the leading number alone, because a tile has room for one.
6. His own day lists what is waiting on him. The quotation with the customer leads with SMAC's number; the lead, the sent-back request and the refused load have no SMAC paper and lead with Kladra's.

**The report and the log are one thing (P12-13)** — `tests/reports.spec.ts`, `tests/correct.spec.ts`
1. Abdulrahman opens the daily report. A rep's card carries what moved, then the sentence he wrote, then the entries themselves — each naming the customer it is about, and the name opens that customer.
2. An entry on that card does not repeat the day or the writer: both are the card's own heading, and every line would have said the same date and the same name.
3. The figure above counts the whole day and the list shows the first of it; where they differ the line under the list says how many there are.
4. Faisal opens the same screen. His own card carries his own entries; his colleague's card carries the figures and the sentence and not his colleague's customers.
5. He logs a visit from a customer's drawer, opens the report, and finds it on his own card under that customer's name.
6. He corrects the words there, without leaving the report, and the customer's own history says the same thing — one record, two screens.

**Across: the choice, the number, the panel and the one button (P12-14)** — `tests/board.spec.ts`, `tests/calls.spec.ts`, `tests/drawers.spec.ts`, `tests/controls.spec.ts`, `tests/quotations.spec.ts`, `tests/schema.spec.ts`
1. Rawan chooses the board on Quotations. She signs in again from a clean session — a different browser as far as the app can tell — and Quotations opens on the board. Dispatches, which she has not been asked about, opens on the list.
2. Faisal signs in at the same machine and gets the list he never left. The choice was hers, not the browser's.
3. She chooses the list again and it is the list that comes back: the row is overwritten, not only written. The database refuses a second answer to the same question, and a kind of question the app does not have.
4. Faisal presses the right button on a customer's number. The number is shown as text with one thing to do — copy — and what lands on the clipboard is what was on the screen, not the wa.me address. A finger held on it for half a second does the same.
5. He opens a company, a project and a quotation in turn: the same panel every time, the same width, arriving from the end of the line — the right in English, the left in Arabic — with its line on the edge facing the list.
6. He raises a quotation for a customer who has been quoted before. The form opens on one blank line: no price, no colour, and the last quotation's name nowhere on it. Add item still opens the next line on the sheet above it.
7. Every screen every role can reach carries at most one brand button (`data-variant="brand"`), empty lists included.

**Abdulrahman (manager)** — `tests/manager.spec.ts`
1. Sign in as Abdulrahman. Home shows company target vs achieved and the team table.
2. Each rep row shows target, achieved, pace, open quotations, overdue follow-ups.
3. The Stuck list names the waiting request, the overdue follow-up and the never-contacted company.
4. A rep on leave is named under his own row with the day he is back, and what is due on his floor today is the first group of the Stuck list, with his name on every row; on his own day he is told who has it while he is out. On a Friday or a Saturday nobody is away and none of it appears — the case `tests/leave.spec.ts` covers, because that screen cannot be walked on a weekend.
5. Open Faisal's companies read-only; no Add company button, and — `tests/rep.spec.ts` — no Log, New contact, New project, Edit, Archive, Mark lost or Request quotation in either drawer, and the follow-up dates read as sentences rather than pickers (D42).
6. The bell lists his notifications; mark one read and the count drops.

**Jerom (admin)** — `tests/admin.spec.ts`
1. Sign in as Jerom. Home is the team screen, and the Admin section lists Users, Targets, Lookups, Holidays and leave, Use, Archive, Export.
2. Create user "Majed" as rep; the Use screen shows him as an account nobody has opened, and the figure above it is what the database says has been quiet for a week. He signs in with the password Jerom read out, and the Use screen stops saying never.
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
the five sentences that separate them — who owns companies, who may price one, who carries a
month, whose floor a company may sit on, and who files a daily report rather than only reading one
— and the role LISTS the action guards take are held to those same sentences, so a screen and the
server cannot answer differently (D50, D56).

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
a quotation line with a zero quantity does not look broken, it looks like arithmetic. Every
attempt below is made against the DATABASE with the app nowhere in the picture — a zero and a
minus in every measurement, the same quotation line twice on one dispatch, a SMAC number
typed onto a second quotation, a second main contact, a company given both a picked city and
a typed one, an issued quotation stripped of its instant and of its number, a reason left on a
quotation the rep has already fixed and a returned one with no reason at all, and a revision
pointing at a quotation that does not exist, a daily report of nothing but whitespace, and a second
report for one person on one day. Each must be refused (D52, D53, D55). Nothing is ever written,
so there is nothing to clean up — and the whitespace case is why that sentence is checked rather
than trusted: `length(btrim(note)) > 0` accepted a note of tabs and newlines, because `btrim`
with no second argument trims spaces only, and the row it let through was the only row this
spec has ever left behind.

**Marketing** — `tests/marketing.spec.ts`
Marketing signs in and lands on a day with no month card, sees Companies and Projects in the
rail and neither chain screen, opens one of its own leads and is offered every piece of a rep's
work on it except the price — on the drawer and on the Quotations screen both. Then it hands the
lead to Faisal: the dialog asks who, says what travels with the company, and the move is checked
in the database and in the audit log (D50, D51).

**The daily report** — `tests/reports.spec.ts`
Faisal's own day is assembled for him and he adds the line it cannot know: the rail carries the
report second, his day screen says today's is not written, the eight figures on his own card are
each asserted against the same records the app read them from, one box and one press closes the
day, the write is on the audit log against the report's own id, and a second press replaces
rather than adds. Then the nudge is gone. Abdulrahman reads the
day before: no box of his own, a participation line whose arithmetic is checked in SQL, and
exactly one dashed blank where a report is missing — with no badge, no tone and no colour on that
card (D55-D57). A weekend is nobody's missed day, and nothing on it reports that nothing was recorded. Two working days back the box is gone and the
day says so, and the arrows never land on a Friday (D58). Rawan's own card carries the desk's
four figures and none of a rep's. And every sentence on the screen is measured for direction:
both languages are on it whichever locale is running, so some paragraphs must compute `ltr` and
some `rtl` on one page, or `dir="auto"` has stopped working.

**What a list is not showing** — `tests/lists.spec.ts`
The seventh spec that is not a walk through a screen, for the reason the others give: the
seeded floor is twelve companies and the caps bite at twenty, twenty-five and two hundred,
so no walk can reach one. What it holds is the arithmetic underneath them — a list shorter
than its cap is the whole list, a list exactly at it is not truncated, and a longer one
keeps its OWN length rather than the length of what was drawn, which is the defect that
would put "20" above twenty rows and mean forty. A band's cap and a stuck group's are also
held under the list screen's, so a person following "and 30 more" never lands on fewer
rows than he left (D80); the band and the group are not ordered against each other, because
they summarise different screens for different people.

**Whose metres these are** — `tests/attribution.spec.ts`
Abdulrahman hands one of Faisal's companies — one with dispatches approved this month — to
Saad. On the team screen Faisal's Achieved is what it was and Saad's is what it was: the
metres stayed with the person who raised the dispatch, as D86 says, and the quotation drawer
under that company says "Raised by Faisal" rather than naming its new owner. The company is
handed back by SQL afterwards, with the hand-over's own audit row and notification removed.

**Whose metres these are, when two reps worked for them** — `tests/credit.spec.ts`
The division is asked directly: 151.03 m² between two people is 75.51 and 75.52, three on a
hundred is 33.33, 33.33 and 33.34, and the parts add back to the whole every time. Then the
app's own SQL is run beside a second expression that reaches the same figure another way, on
every approved dispatch there is, and the two have to agree to the hundredth. Then the whole
month, both ways round: what the company moved, and what its people were credited. Then the
screens — the shared tower's dispatch drawer names both reps and what each took, and Faisal's
month card shows the credited figure, which is deliberately NOT the sum of what he raised.
Last, the question itself: Faisal opens a dispatch on a job he works alone and is asked
nothing, opens one on the job he shares with Saad and is offered both names and "split".

**A floor is a role and an id; a child comes back onto its company** — `tests/floor.spec.ts`, `tests/restore.spec.ts`
Pure: every role writes on its own floor exactly when a company can sit on that role (D91).
Jerom tries to make Faisal a coordinator and reads how many companies are still on him;
the new rep from earlier, who holds none, becomes one. A contact is archived, then its
company: the archive screen shows "restore the company first" on the contact's row and no
button; the company is restored and the contact's row offers Restore again; restored, both
are back and the company's reason is gone (D92). `npm run backup` then `backup:verify` is
run by hand after a working day and passes on the recorded counts (D93).

**A phone in its country, a month in its row** — `tests/phone.spec.ts`, `tests/months-change.spec.ts`
Pure. The same digits read as Saudi on a Riyadh card and as UAE on a Dubai one; a plus wins;
a country code typed without its plus is honoured wherever the card is; eight bare digits
are refused rather than guessed (D89). Over the bars: a per cent when the month before had
metres, "first" only when nothing came before, "after an empty month" otherwise, and
"nothing" when the last two are empty (D90). In `tests/phone-walk.spec.ts` Faisal adds a
Dubai company with a local number and reads +971 back from the row and from the WhatsApp link.

**A number typed wrong** — `tests/smac.spec.ts`
Rawan issues a request with a SMAC number another quotation already carries: the field says
which one, and the request stays waiting. She corrects the number on an issued quotation —
the dialog opens on the number as it stands — and the drawer shows the new one with "was …"
in its trail; correcting it to a number a third quotation holds is refused by name. The same
on an approved dispatch, whose month does not move. Faisal is offered no correction. Faisal
adds a contact with a phone already on the company and reads "already on this company" at
the field rather than "something went wrong" (D88). Each test puts the numbers back.

**A drawer says what it writes** — `tests/drawer-writes.spec.ts`
Faisal opens a company with an open project and asks for a quotation from its drawer: the
dialog asks which project, refuses a save without one at the picker, and the saved row carries
the project he picked. On a company with no open project the tab says to add one first and
offers no button. With the company's date ten days out and a project's three, the drawer says
the project is due first and that the list shows the earlier; clearing the company's date says
the project still has its own, and the project's date is untouched (D94). Each test puts the
dates back and removes what it raised.

**The figures under a figure** — `tests/figures.spec.ts`, `tests/numbers.spec.ts`
Pure: never opened is quiet, opened this week is not, the window is the line, and away today
excuses today whatever came before (D95). On the floor: Faisal's open quotations equal the
three parts named under them, counted from the database by the same definition, and the
sent-back tile is the day's own list minus the ones with the customer. In `tests/queue.spec.ts`
Rawan's longest wait is the oldest row her two lists show, and archiving the company of the
oldest request moves it to the next one rather than leaving a wait over a desk that does not
hold it.

**The chips over a list** — `tests/filters.spec.ts`
Every chip on the quotations, dispatches, projects and lookups screens is the same height, asked
of the pixels rather than of the import — a private copy is a different shape, and the shape is
what gives it away. At 375 and at the last phone pixel the list/board switch is above the chips
rather than among them; at a desk width they are one row (D145, D128). Reads only.

**A dispatch says what happened to it** — `tests/dispatch-trail.spec.ts`
Rawan opens the dispatch she refused: its trail starts with the request, carries her refusal with
her own words and her name on it, and reads oldest first. Faisal opens an approved one of his and
reads the same trail on his own screen, with the request and the approval both on it, the request
first, and nothing to press (D143, D42). "The request first" is the assertion that catches an
approval dated before the request it answers (§5 #152). Reads only.

**One clock** — `tests/one-clock.spec.ts`
A company of Faisal's is promised a call twelve days ago and a company holiday is put inside that
window, so the working-day answer and the calendar answer are different numbers and only one of
them may appear. Abdulrahman opens his screen: the row says the working-day count, and does not
say the calendar one. Then the team table — it has a gone-quiet column at all, which it did not
until P11J, and pressing a rep's figure opens the list that figure counted (D141, D142). The
date and the holiday go back after.

**Why we lose** — `tests/losses.spec.ts`
Abdulrahman opens his screen and the card under "Where quotations go" names every reason the
quarter's projects were given up for, largest metres first, each row carrying its own metres and
its own count — all of it asked again in the spec's own SQL, so the card and the database cannot
drift. Its sentence counts the same projects its rows do. A reason somebody wrote by hand counts
under "Other" and is not a row of its own, because that line belongs on the project (D140).
Reads only.

**The desk knows what it is holding** — `tests/lost.spec.ts`
The seeded queue holds a request whose project was marked lost after it was raised. Rawan opens
her queue and the row says the project was marked lost; she opens it and the drawer says which
day and why, in her language and not in the stored code. Turki opens the same company and reads
the reason as a sentence on the project's own card, with the code itself nowhere on the screen.
Then the palette: Rawan finds a company by name and lands on her quotations filtered to it, with
rows under her; Faisal finds one of his and lands on the company drawer, as he always did
(D138, D139). Writes nothing.

**One desk, one box, her order** — `tests/queue.spec.ts`
Rawan opens her queue: the first row of the quotations list is the oldest thing waiting, which is
the row the caption above it is already talking about. The screen has one element with the search
role on it, not two; typing a customer's name into it puts the term on the URL once, filters the
list under it, and the box she typed in is the box holding the words (D137).

**A count counts the rows its list shows** — `tests/counts.spec.ts`
One of Faisal's companies is put a day late on its own date and on a project's — the shape
that used to count as two. On Companies filtered to overdue, the active pill's sentence is the
one built from the number of rows in the table and the company is one of them; on Projects the
overdue chip's sentence is built from the project rows and the project is among them; on the
day the overdue band's heading carries the number of its cards, the company is a card, and
there is no "and more" link, because everyone late is there (D108). The dates go back after.

**A company that comes back is recognised** — `tests/known.spec.ts`
Faisal opens Add company and types the number of the seeded archived company's contact: the
warning under the phone says the company was archived, on which day and whose it was, in his
locale, and carries the reason typed then; Save is still enabled (S15, D109). Then he types the
name of a colleague's live company: the warning names it and its rep, its city, and the day it
was last worked. Nothing is written.

**A call card says why** — `tests/why.spec.ts`
An entry is written into Faisal's log in Arabic with today's follow-up; on his day the card for
that company carries the entry's words in a line of their own: the words take their direction
from the text and the line starts where the card starts, in the page's direction (D111, and the
line rule in DESIGN §5). The entry and the date are taken back after.

**The presses** — `tests/presses.spec.ts`
Jerom adds three free days from one dialog with a first and a last day and reads "3 days
added"; the same span again adds nothing and the calendar still holds three (D113). Rawan
opens a waiting request, types SMAC's number and presses Enter; it is issued with that number
(D114). On next month's targets Faisal's box is empty, says what last month was, one press
keeps it and Enter saves it (D115). Faisal presses Log on a company with one contact and the
form opens on that person (D115). On Rawan's queue the row names the rep in her script; on
Faisal's own list no row names him (D116). Every write is taken back.

**A count is a door** — `tests/counts.spec.ts` (step 4), `tests/manager.spec.ts`
Abdulrahman reads Faisal's overdue count on the team table, presses it, and lands on Faisal's
floor with the overdue pill active and exactly that many rows under it (D117). The pace cell on
the desk reads the same sentence as the month card (D117).

**The waiting list, by kind** — `tests/stopped.spec.ts`
On Faisal's day the heading's three pills count the cards wearing each badge and add up to the
cards drawn; the stopped kinds come first; the sent-back pill opens the quotations list under
that status with that many rows (D118). Reads only.

**A revised paper on the queue** — `tests/revised.spec.ts`
A later revision is written under the seed's waiting dispatch; Rawan's queue row says the
quotation was revised since, the sheet says the sentence the action would refuse with, Approve
is disabled and Refuse is not (D119). The revision is deleted after.

**The warning's door** — `tests/known.spec.ts`
Faisal types a company somebody else already has: the warning names it and its rep and offers
no door (S8). He types one of his own: "Open {name}" opens that company's drawer over the form;
Escape closes the drawer and the form is still open with the name typed (D121). Reads only.

**The missing screen and the empty ones** — `tests/states.spec.ts`
Faisal opens an address that names no screen: the card says so inside the shell, names no code,
and Home takes him to his day (D122). He types a word into the project picker that matches
nothing: "Nothing matched", never "no projects yet" (D127). Rawan searches the board and the queue
for a word nothing carries: a sentence with its Clear, no empty columns, no "desk is clear", no
"All" (D127, #99). Abdulrahman reads Faisal's floor, types, opens a row and takes the way back
from an empty search: `?rep=` survives all three (D127). Reads only.

**The pressed row, the rail and the chrome** — `tests/feel.spec.ts`
Faisal collapses the rail: the next page's HTML is already narrow (D124). The theme cookie
flips to light: the browser's chrome colour follows (D124). The drawer's answer is held back
and a pressed row shows its mark until the answer lands (D126). Restores the rail after.

**Less motion** — `tests/motion.spec.ts`
A dialog zooms in 150 ms and a drawer slides in 200 ms; with the operating system asked for
less motion, both are instant and the arrived flash is still two seconds (D123). The splash
wears the light theme offline (`tests/pwa.spec.ts`, D125); the board's open card is a wash
(`tests/board.spec.ts`, D123). A bottom sheet on a phone slides in 250, not the library's 500
(D129). Reads only.

**What he wrote about the customer** — `tests/notes.spec.ts`
Faisal opens a company and reads his own note on the drawer, under the buttons and in the words
he typed; he edits it and the drawer says the new thing; the contact he wrote about carries his
line on that contact's own card; the project's note is on the project sheet. Abdulrahman opens
the same company on a floor he does not own and reads the same note with nothing to press
(D136, D42). Writes nothing that stays: the edit is put back.

**The wire cut** — `tests/unhappy.spec.ts`
Faisal types a sentence into Log and the server cannot be reached when he presses Save: the
app says so, the sentence is still in the box, Save is alive, and the screen behind is still the
drawer, not the error card; the wire comes back and the same press writes it into the
company's history (D132). The same with a company half-filled — the footer says it and the
fields keep their values — and with the archive question — the sentence is the toast a
confirmation uses for every whole-form refusal, and the question stays open with its reason.
Then the answer is lost instead of the request: the row lands, Faisal is told nothing did, and
his second press finds the row instead of making a twin — one row in the table (D134). Then
his session ends while he types: the refusal says so and keeps the words, and the screen behind
is still the drawer (D135). Last, the entry filed on the wrong day: he unfiles it and writes the
same words again, and the row that is off the floor does not answer for the one replacing it
(D70 with D134). Six tests, both locales; writes four activities per locale, one of them unfiled.

**One hand at 375** — `tests/thumb.spec.ts`
At 767 wide the rail is gone and Add company opens as a bottom sheet; at 768 the rail is there
and it opens as a dialog — the shell and the forms change on the same pixel (D128). At 375
Faisal opens his company: Log, Add project and, from the Quotations tab, Request quotation are
each a bottom sheet with Save the lowest button, on the screen without scrolling and a thumb
tall (D129); he writes a visit from the log sheet and it is in the company's history. On his
day the first call card's Log, number and handset are each 44 by 44, and every door on the bar
is a thumb tall (D130); what came back to him is read before the calls, each row a thumb tall
and nothing wider than the screen. Writes one activity.

**The guards** — `tests/csv.spec.ts`, `tests/guards.spec.ts`
Pure: a cell that opens with `=`, `@`, a tab, or `+`/`-` before anything but a number is
apostrophed; a phone, a negative figure, a quoted name and an empty cell are what they were
(D96). On the phone: Faisal opens Log on a company, types a sentence, and swipes back — the
sheet is still there with his words; he cancels, swipes back again, and leaves the screen.
Jerom's companies export carries a company named like a formula as text, apostrophe first.

**A day as it happened** — `tests/figures.spec.ts`, `tests/calendar.spec.ts`
Pure: a rep's card carries the chain and marketing's the two figures it can move; the box on
an off day is offered while open, gone when closed, kept when written (D97). On the screens:
marketing's own report card shows two figures and the manager reads the same two; a request
raised forty days ago with a company holiday between then and the first of this month ages
the holiday as a day off on the manager's stuck list and on the coordinator's queue, by the
same arithmetic the spec runs itself.

**A number is a call** — `tests/calls.spec.ts`
Faisal's day: a card on Calls due carries the number as a WhatsApp link and a handset whose
link is `tel:` and the same number; a company with no contact reads "No contact yet" on its
card as it does on the list. The customer list and the drawer's contacts carry the same pair.
Rawan opens Issue on a request and reads the customer's name under the title before she types
the SMAC number; the same on Approve for a dispatch and on both corrections (D98).

**What the walk never did** — `tests/dispatches.spec.ts`, `tests/quotations.spec.ts`, `tests/schema.spec.ts`
Rawan refuses a submitted dispatch with a reason: it leaves her queue, Faisal's day lists it as
refused with her words, and the trail has the row. Faisal records a customer's rejection on an
issued quotation with the reason: it leaves "with the customer", the status and the instant are
both set, and the trail has the row. The database refuses a decided quotation without its
instant and an undecided one with it. The admin sweeps in `tests/admin.spec.ts` and
`tests/controls.spec.ts` read the rail's list, so a screen added to the rail is swept (D99).

**What the database holds** — `tests/schema.spec.ts`
The database refuses a notice about a kind of record it has no list entry for, a second
quotation line at a position already taken, and a target dated inside its month rather than on
its first day; `pg_indexes` has the use panel's index by person and instant and the line index
by position — asked of the catalogue, not of the ORM's opinion (D100). A notice of a kind no
locale has a sentence for, a trail line about a kind of record nobody writes, and an archive
reason on a live company are each refused; and every check and index the schema file names is
in the catalogue, and nothing in the catalogue is a stranger to the schema file (D106).

**What the database is asked** — baseline for 11I (D107)
Measured 6 Sep 2026 on the production build against the volume floor (828 companies, 432
projects, 348 quotations, 551 activities): every role's screens, 653 statements over 45 screens.
Worst statement 12.6 ms — the manager's projects list, before `activities_project_happened_idx`;
manager's day 48 statements and 29 ms of database time; rep's day 32 and 22 ms; admin sign-in
32 and 16 ms; every other screen under 10 ms. Method: `alter system set
log_min_duration_statement = 0` and a `%d` in `log_line_prefix` on the kladra database, one
marker statement per screen, `docker logs kladra-db-1 --since`, then EXPLAIN (ANALYZE, BUFFERS)
of each distinct statement with the parameters the log recorded; both settings reset after.
11I built the repeatable harness — `npm run measure:reads` (`scripts/reads.ts`), the same method
scripted: logging on for the run, a marker statement either side of each screen fetched with a
real session cookie, the container's log cut at the markers, four roles, forty-three screens
including one open drawer per list — and re-measured on 7 Sep 2026 against the same floor.
It counts the server's rendering of the document alone, nothing the browser asks for after
(the bell's count, the live channel), which is why its figures sit under the ones above: 459
statements over 43 screens before P11I-1, 400 after the session user and the calendar became
once-per-request reads (D131) — the rep's day 20 → 19, the manager's team screen 29 → 27, the
open company drawer 25 → 23, every screen at least one fewer. Worst statement 4.3 ms, the
customer list's company query with its standing figures; no screen over 17 ms of database
time. `scripts/reads.baseline.json` holds the count per screen; `npm run measure:reads -- --check`
refuses a screen that asks more than its baseline (the bare `--check` is eaten by npm itself). A screen may not grow past these numbers
without a sentence here saying why, and then `--write`.

**Speed on a mid phone** (D133) — `npm run measure:speed` (`scripts/speed.ts`) against the
production build on 3102: Chromium with the CPU four times slower and a slow 4G (1.6 Mb/s
down, 150 ms each way — Lighthouse's "mobile"), 375 by 812, signed in through the real form in
a throwaway context and only the cookie carried into a fresh one, so nothing is cached; then
the same screen warm. Medians of three, measured 7 Sep 2026 after the fourth font weight went
(#131), in milliseconds and kilobytes over the wire:

| screen | paint | largest | live | cold kB | script | warm live | warm kB |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| rep, day | 1460 | 1552 | 3156 | 530 | 286 | 365 | 61 |
| rep, companies | 1580 | 2148 | 3498 | 582 | 308 | 401 | 86 |
| rep, quotations | 1300 | 1512 | 3185 | 523 | 265 | 373 | 76 |
| coordinator, queue | 1316 | 1316 | 3183 | 524 | 269 | 429 | 68 |
| coordinator, quotations | 1164 | 1680 | 3320 | 541 | 265 | 358 | 86 |
| manager, team | 1216 | 1216 | 2873 | 467 | 237 | 378 | 44 |
| manager, companies | 1564 | 2120 | 3353 | 576 | 308 | 388 | 82 |

"Live" is the `html[data-hydrated]` mark the suite waits for. The document itself is 37–78 kB
compressed and 500 kB decoded on the volume floor; the rest of a cold load is script (237–308
kB) and fonts with styles (about 160 kB, five font files preloaded). Before the font weight
went the same screens were 500–611 kB and live in 3.2–3.8 s. `scripts/speed.baseline.json`
holds the cold "live" and bytes per screen; `--check` refuses a fifth slower or a tenth heavier.
Two traps the script documents in its header: tsx wraps every named function in `__name`, which
the browser lacks, so browser-side code has no named inner functions; and `request.sizes()`
reads a cache hit as a negative number, so bytes come from the page's own resource timing.

**The flow, counted** — baseline for 11D
Walked 6 Sep 2026 in the code, creation to oversight, the shortest honest path a person who
knows the app takes from the screen they start the day on. A press is a click or a tap; a text
field is one press to reach it; a select or a date is two (open, choose); a confirm is one more.

| Task | Who | Presses | Typed | Filled by the app | Must remember |
|---|---|---|---|---|---|
| Log a call on a company due today, from the day | rep | 4 | 1 | company, contact, today; channel opens on visit | — (the card says why, #75) |
| Add a company with its first contact | rep | 4 (9 with category and source) | 2 (4) | country, city | — |
| Request a quotation, two lines, from a project | rep | 14 (3 + prices from "copy the items") | 6 | thickness, sheet, quantity 1; line 2 takes line 1's four lookups | — |
| Raise a second dispatch on a quotation | rep | 3 | 1 | shipment, destination, terms (D81) | — |
| Mark a project lost | rep | 4 (5 for Other) | 0 (1) | — | — |
| Find a company by the number that just called | rep | 2 | 1 | — | — |
| Hand a company to a rep | marketing | 4 | 0 | — | — |
| Issue the top request with its SMAC number | coordinator | 3 (was 4, #78) | 1 | — | — (the notice names the customer, #74) |
| Send one back with a reason | coordinator | 4 | 1 | — | — |
| Approve a dispatch with its SMAC number | coordinator | 3 (was 4, #78) | 1 | — | — (the line says what already went, #76) |
| From home to "who is stuck and why" | manager | 1 | 0 | the Stuck list is on the home screen | — |
| Read one rep's yesterday | manager | 2 | 0 | — | — |
| Set one rep's target for next month | admin | 3 (× 5 people; 2 to keep last month's, #79) | 1 (0) | last month's figure, offered | — |
| Add one public holiday | admin | 5 | 0 | today, everyone | — |
| Enter a rep's fortnight of leave | admin | 8 (was 84, #77) | 0 | — | — |
| Restore an archived company | admin | 3 | 0 | — | — |

What the shell gives for nothing: Ctrl/Cmd+K from any screen and a number typed in any shape
finds the contact; every form dialog opens with the first field focused and Enter saves it;
saving opens the record just made; Log is on every card and every row of a day and a drawer
(D82); every list creates from itself (P8.2). The rep's four lobby tasks are inside S23's
minute. Where the presses go instead: three dialogs and one box take a click where every other
takes Enter (#78); the admin's calendar takes one day per dialog (#77); a month's targets are
five boxes and five Saves (#79). What a person carried in their head was the longer list, and
it is where the findings were: the reason behind a call, the customer behind a number, what
had already gone against a quotation line, and a company that came back from the archive with
nothing to say it had been there. Re-walked after the ten fixes: the table above carries the
counts as they stand, with the old figure in brackets where one changed.

**What it says it is** — `tests/numbers.spec.ts`, `tests/calls.spec.ts`
The funnel's sent-back row reads "not asked again yet" and, when it counts anything, how many
days ago the oldest was last sent back — the same number SQL gets from the trail. Faisal
presses Log on a call card and the form opens on the contact the card names; from the drawer's
header it opens on nobody (D101).

**Two people, no reload** — `tests/live.spec.ts`, `tests/live-unit.spec.ts`
Faisal raises a quotation in one browser; Rawan's queue, open in another, shows it within the
arrival window, marked as just arrived, with no reload — and the mark is timed on the page's
own clock: on the row the moment it is added, off two seconds later, not two seconds after
the event. Rawan issues it; Faisal's list and bell change under him. While Jerom views as Faisal the channel and the count still open. The
listener's own outage ends with one resync. Four hundred recipients cut into three payloads,
none lost, none doubled (D105).

**One word for one thing** — `check:messages`, `tests/figures.spec.ts`
The English carries no "pick" or "select" (the glossary pass fails the build on one), every
computed key has a word in both locales, and the months sentence picks up, down or the same
(D102). The Arabic is read by the reviewer against SPEC §5 each slice.

**Two hands on one row** — `tests/two-hands.spec.ts`
Rawan issues a request in one tab and again in a second tab that still shows it waiting:
the second gets "not waiting any more" and the table holds one issue. Faisal asks for the
last panels of a quotation from two tabs at the same instant: one dispatch exists
afterwards and no line is oversold. He raises a dispatch, revises the quotation under it,
and Rawan's approval is refused with the sentence for a superseded one (D85).
The tabs have the live channel cut off for the test's duration: a coordinator watches every
quotation, so the loser's own refusal and the winner's news would otherwise land in one paint.
The third test refused to pass until it did — the live-revision check had lost its table
qualifier (rules/data.md) and never refused anything. And each test takes back what it wrote before the
next spec runs — the issued request goes back to waiting, the dispatch and the revision are
removed — because both locale projects share one seeded floor and the Arabic dispatch chain
expects it as the seed left it.

**The waiting list at volume** — `tests/waiting-cap.spec.ts`
The one cap the seeded floor can be pushed past from a test: thirty-one quotations are sent
back to Faisal, the oldest a year ago, and his day is read. Twenty-five cards, the true
figure in the heading, "and N more" under them, and the oldest at the top — the order the
query never had until the critic read it (D83). The rows are deleted again whatever happens.

**Reading a screen** — `tests/reading.spec.ts`
Not a walk either: a sweep of every screen a rep reads, in both locales, for the rules DESIGN §5
earned the hard way. Nothing with an Arabic letter in it is forced left-to-right, every date reads
the same way round measured with `document.createRange()`, a value and its unit read the way the
language does, no label the app wrote is cut off mid-word at 375, 768, 1024 or 1366, and every
figure is in Western digits. **A new screen goes on its list the day it lands** — `/reports` was
added with P9.3 and immediately caught the date navigator, which had been written with `dir="ltr"`
and the mono figure face round a date that carries a month name.

**How long something has waited** — `tests/waiting.spec.ts`
The fourth spec that is not a walk through a screen, and it earns the exception the same way the
floor rule does: when this is wrong it looks right. "2 working days" beside a request raised on
Thursday and read on Sunday is a plausible number, and the only way to know it is a lie is to count
the weekend yourself. Every case crosses a Friday or a Saturday on purpose, on a fixed week rather
than on today, because a spec whose answer changes with the day it runs is one nobody trusts on a
Monday. Today is nought and not one; a weekend is not a wait; nor is a holiday or that person's own
leave; on the line is not over it (D59).

**Numbers that answer a question** — `tests/numbers.spec.ts`
Rawan's four figures, checked for the two things Jerom's rule actually asks. Each one carries a
caption — four figures, four lines of words — and the strip agrees with the list beneath it: the
longest wait shown is the worst row's own wait, and the count of late ones in the caption is the
number of rows the list itself marks late. Both come from `src/lib/waiting.ts`, so the caption
cannot drift from the rows. The count is read off the element rather than out of the sentence,
because the sentence has two numbers in it — how many are late, and what late means — which is
right for a person and useless for a test. Locators are `:visible`: every row renders twice, a card
for the phone and a table for the desk, and counting DOM nodes counts each row twice and passes.
Then Abdulrahman's four, for the collision the inventory found: the strip's follow-up figure and the
table's column beneath it are two different numbers, and the spec holds their names apart and holds
the strip to saying its own threshold. Drilling into a rep lands on a card that says whose month and
when (D60), and on a band that says what is in play on his floor — open quotations, how many of
them the customer is holding, and what has stopped on him — every figure read back out of the
database rather than off the row it was opened from. A second test walks the same band from the
other end: what the strip on his floor calls stopped is the rows his own day lists as sent back or
refused, so the manager's count and the rep's list cannot be two lists (D78).
Then the months card: six of them, oldest first, each carrying its figure as TEXT — the
bars are aria-hidden because nothing is in the picture that is not in the number above it — and one
sentence saying which way the last finished month went (D61). Then the chain cohort: six endings,
each named, and the six adding up to the number the sentence above them claims was raised — a cohort
whose parts do not sum to its whole has lost some on the way. Every ending has something in it on
the seeded data, which is the rule about figures the demo always shows as zero (D62). Three
guards were added as the causes behind them were fixed: no month label on the axis is wider than
its own box at 375, and the six bars stand on one baseline (D65); a row the queue calls late says
the WORD late and not only the red (DESIGN §5); and the gone-quiet band on a rep's day and the
pill on his customer list open the same set, counted from SQL rather than from the screen (D63).

**The one screen a signed-out person can reach** — `tests/login.spec.ts`
Three assertions, each of which would have caught one of the ways sign-in had drifted out of the
app it opens (D67). It has exactly one level-one heading and that heading is the thing you came to
do — it had none at all, because a CardTitle is a div. The address and the password both run left
to right, in a page that runs right to left. And a refusal answers without moving the screen: the
wordmark's position is measured before the wrong password and after the error, and the two must be
the same number, because the card grows by a line and the whole block is centred on the canvas. The
alert is located by its id, not its role: Next keeps its own route announcer, which is also an alert.

**Correcting the log** — `tests/correct.spec.ts`
Faisal logs a visit, corrects the words, then unfiles the entry, and the spec counts rows
rather than reading the screen: the three figures the log feeds for that customer — how many
entries, the last day anything was logged, and how many he logged today — must be unchanged
by the correction and one lower after the unfiling (D70). The row is then checked to be still
there: nothing is deleted (S16). Each write waits for its DIALOG to close before the database
is read, because the words are in the box he typed them into as well as in the list, and a
page-wide text assertion passes while the write is still in flight.

The same file holds the other half of the complaint (D71): from his day, with nobody's
customer list in between, he opens the log on a call row, writes, saves — and the assertion
is the URL. He never left. The row locator is scoped to the "who to call" section, because
the rail is a list of links too and an unscoped `li` finds a nav item first.

**Words dropped into sentences** — `tests/isolate.spec.ts`
The other one, and for the same reason: it has no appearance until a customer is called "3M Arabia". Every `{placeholder}` in every shipped message, both locales, is checked to come out of the loader isolated — and the loader is checked to have added the two invisible characters and changed nothing else (D46). A plural branch is not a value and stays untouched.


## §5 What a stranger found — the ledger, one line per entry (P11A–P12)

Two hundred and five findings from twelve stranger readings and every box since, each fixed at its cause with a rule and a test. The full account of each — the cause, the sweep, what was refuted and why — is in the git history of this file up to commit e5c90cd; here every entry keeps its number, its title and the decision it produced, so a D-number or a #number quoted in SPEC, DESIGN or a code comment still resolves.

- [x] 1 Two dispatches can spend the same panels. (D85)
- [x] 2 A dispatch already waiting is never re-checked against a later revision. (D36, D85; P11A-1)
- [x] 3 A hand-over rewrites past months' achieved metres. (D86; P11A-2)
- [x] 4 A quotation names the rep who no longer owns the company. (D86; P11A-2)
- [x] 5 A SMAC number cannot be corrected, and a duplicate says "something went wrong". (D88; P11A-4)
- [x] 6 Six status transitions have no compare-and-swap. (D85; P11A-1)
- [x] 7 Archiving a company records no reason. (D87; P11A-3)
- [x] 8 Unfiling an old entry rewrites a reported day. (D87; P11A-3)
- [x] 9 Phones are normalised as Saudi whatever the country. (D89; P11A-5)
- [x] 10 A promoted account keeps its floor for ever. (D91; P11A-6)
- [x] 11 Restoring a stray archived contact un-archives its company as a side effect. (D92; P11A-6)
- [x] 12 `backup:verify` fails on any day the business used Kladra. (D93; P11A-6)
- [x] 13 The six-month card calls a month "the first with anything" while its own bars say otherwise. (D90; P11A-5)
- [x] 14 D84's guard does not cover the phone's back gesture. (D96; P11A-9)
- [x] 15 The drawer's follow-up picker cannot clear a badge a project drives, and says it did. (D94; P11A-7)
- [x] 16 A quotation raised from the company drawer belongs to no project, by default. (D94; P11A-7)
- [x] 17 A Postgres blip longer than one reconnect loses live events with no resync. (D105; P11A-5)
- [x] 18 `requireActor()` gates the SSE and count routes, so live updates 401 during "view as". (D105)
- [x] 19 CSV cells are not neutralised against a leading `=`, `+`, `-`, `@`. (D96; P11A-9)
- [x] 20 No error boundary in the signed-in app. (D122; P11G-1)
- [x] 21 Edit and unfile of a log entry never call `notifyLive`. (D94; P11A-7)
- [x] 22 The adoption headline counts people the same screen excuses as away. (D95; P11A-8)
- [x] 23 A rep's "open quotations" does not sum to the two figures under it. (D95; P11A-8)
- [x] 24 The queue's "longest wait" can name a request in neither list under it. (D95; P11A-8)
- [x] 25 `check-messages` guards five computed-key families and misses six more (D96; P11A-9)
- [x] 26 A rep who works a Saturday cannot write that day's report. (D97; P11A-10)
- [x] 27 The day's Log and WhatsApp controls are small and sit over a whole-card link. (D130; P11H)
- [x] 28 New Project and Edit Project never become bottom sheets. (D129; P11H)
- [x] 29 "Calls due" has no way to place a call. (D98; P11A-11)
- [x] 30 Marketing's daily report shows six figures it can never move. (D97; P11A-10)
- [x] 31 The SMAC prompt hides the company while the number is retyped. (D98; P11A-11)
- [x] 32 Stuck-request ageing reads holidays from the first of this month only. (D97; P11A-10)
- [x] 33 The queue's headline counts are a capped array's length. (D144; P11J-7)
- [x] 34 The board's "current card" ring is the alert red DESIGN already retired once. (D123; P11G-2)
- [x] 35 The phone breakpoint is written three times — 639, 640 and 768. (D128; P11H)
- [x] 36 The admin gate is hand-copied into seven pages, and both test sweeps miss `admin/use`. (D99; P11A-12)
- [x] 37 A dispatch is never refused in the seed, the spec or the walk. (D99; P11A-12)
- [x] 38 Nor is a quotation ever rejected live, nor `quotations_decided_check` tested. (D99; P11A-12)
- [x] 39 A call card with no contact says nothing; the customer list says "no contact". (D98; P11A-11)
- [x] 40 A collapsed sidebar snaps open on every load. (D124; P11G-3)
- [x] 41 The browser chrome colour follows the OS, not Kladra's theme. (D124; P11G-3)
- [x] 42 `notifications.subject_type` is free text pretending to be a closed type. (D100; P11A-13)
- [x] 43 `audit_log` has no index for the adoption query. (D100; P11A-13)
- [x] 44 Seven admin writes log an audit row whether or not a row changed. (D87; P11A-3)
- [x] 45 The funnel calls a fresh "sent back" request "never asked again". (D101; P11A-14)
- [x] 46 The round-sum-round m² formula is retyped in six places. (D86; P11A-2)
- [x] 47 `check:messages` is not in the build or the stated pre-commit chain (D103; P11A-16)
- [x] 48 "Revision" is نسخة on a dispatch error and مراجعة everywhere else. (D102; P11A-15)
- [x] 49 The D68 name test passes when the person does not render at all. (D103; P11A-16)
- [x] 50 The "nothing can be written while viewing" test can skip its only write. (D103; P11A-16)
- [x] 51 The 44px touch rule lives in one file. (D130; P11H)
- [x] 52 The hand-over warning for marketing names what never moves and not what does. (D86; P11A-2)
- [x] 53 The offline page is always dark. (D125; P11G-3)
- [x] 54 The coordinator's queue never highlights an arrived row. (D105)
- [x] 55 `quotation_items` has no unique index on position; `dispatch_items` has. (D100; P11A-13)
- [x] 56 A target's month is normalised in Zod only, never in the database. (D100; P11A-13)
- [x] 57 Two revisions at once collide on the unique index and crash generically. (D85; P11A-1)
- [x] 58 `unused-messages` exempts all of `common.*` off one dynamic call (D101; P11A-14)
- [x] 59 "picked" in `errors.cityNotInCountry`; the glossary says never pick or select. (D102; P11A-15)
- [x] 60 "Person" is الموظف on the team screen and الشخص in admin. (D102; P11A-15)
- [x] 61 `seed:volume` writes no audit trail (D104; P11A-17)
- [x] 62 `admin.spec.ts` re-implements Riyadh-today and the weekend. (D103; P11A-16)
- [x] 63 Nothing automated covers the live channel. (D105)
- [x] 64 The NOTIFY chunking branch has never run. (D105)
- [x] 65 The log dialog does not preselect the contact the card shows. (D101; P11A-14)
- [x] 66 Eleven primary buttons fall back to a flat red instead of the brand gradient. (D123; P11G-2)
- [x] 67 `archivedCount()` is dead code whose comment describes a badge that was never — deleted (P11A-14, D101) — built.
- [x] 68 The dev server on 3100 hung with one core pinned and 3.5 GB resident, and stayed hung. (P11J-7)
- [x] 69 `seed:volume` drew its SMAC numbers at random from four digits and collided with itself.
- [x] 70 A typed reason on the quotation and dispatch sheets ran in the page's direction, not the writer's.
- [x] 71 One screen asks the database forty-eight questions, and every screen reads the session row seven times over. (D107, D131; P11I-1)
- [x] 72 A follow-up count counts dates, and the list it opens shows something else. (D9, D95, D108)
- [x] 73 A company that comes back from the archive is not recognised. (D109)
- [x] 74 A notice names a number and never the customer. (D68, D79, D110)
- [x] 75 A call card says who to call and not why. (D111)
- [x] 76 The dispatch sheet says quoted and sending, never what already went. (D85, D112)
- [x] 77 Two weeks of leave is fourteen dialogs. (D113)
- [x] 78 Enter does nothing in the coordinator's number box, a target box, or a new project. (D114)
- [x] 79 A month's targets are five boxes, five Saves, and no memory of last month. (D115)
- [x] 80 Logging on a company with one contact still asks which contact. (D101, D115)
- [x] 81 A queue row does not say whose request it is. (D68, D116)
- [x] 82 A typed line on a wide card floats to the far edge.
- [x] 83 The desk team table's pace cell drops its unit. (D117)
- [x] 84 The team table's habit counts go nowhere. (D117)
- [x] 85 The day's waiting list ranks a customer's silence above a coordinator's send-back. (D118)
- [x] 86 The queue does not say a quotation was revised under a waiting dispatch. (D85, D119)
- [x] 87 The chain card's sentences at one. (D120)
- [x] 88 The Use screen's words and its window disagree. (D120)
- [x] 89 The report's biggest figure has the vaguest name. (D120)
- [x] 90 Fifteen numbers where five bars would do.
- [x] 91 The pipeline figure carries ".00" on a screen of whole metres. (D117)
- [x] 92 The report's moved line says "1 Companies". (D120)
- [x] 93 The duplicate warning cannot open the company it names. (D121)
- [x] 94 A pressed row said nothing until the drawer answered. (D126)
- [x] 95 A picker's search miss said the list was empty. (D127)
- [x] 96 An empty board was six columns of "Nothing here." (D127)
- [x] 97 The queue called the desk clear under a search that missed, and offered an "All" that led nowhere. (D127)
- [x] 98 A manager's `?rep=` was dropped by a search, a row and the way back. (D127)
- [x] 99 Any search term without a digit took the quotations, dispatches and queue lists down.
- [x] 100 The lookups list said nothing when a kind had no rows. (D127)
- [x] 101 The sign-out could be pressed twice. (D126)
- [x] 102 Dialogs zoomed in 100 ms, outside the band DESIGN names. (D123)
- [x] 103 The board's hover wash was the current wash.
- [x] 104 The pending mark said nothing to a screen reader. (D126)
- [x] 105 The account menu was named "Your account" and nobody's.
- [x] 106 The rail's cookie could throw inside a render, and another tab's toggle was lost.
- [x] 107 A quotation number typed on an Arabic keyboard was never found.
- [x] 108 The Add project sheet named no company.
- [x] 109 vaul slides a sheet in 500 ms, twice DESIGN's band. (D129)
- [x] 110 A dirty log sheet could be swiped away. (D84, D129)
- [x] 111 The bell wrote the 44px rule by hand.
- [x] 112 A confirmation's Enter did nothing, and its buttons were not a form. (D114)
- [x] 113 The prompt's "whose record" line was read by nobody. (D98)
- [x] 114 The sheet's 250 ms outranked "less motion".
- [x] 115 A held sheet still showed the handle that invites a swipe.
- [x] 116 The log's channel chips were the one control in the sheet under 44. (D130)
- [x] 117 Four forms' submit did not stop at itself, and the SMAC box could be autocorrected.
- [x] 118 Five sheets could still be swiped away with words in them. (D129)
- [x] 119 `(max-width: 767px)` is not `max-md:`. (D128)
- [x] 120 The tab a thumb presses was 37px inside a 44px list. (D130)
- [x] 121 Three search boxes' clear grew over the text.
- [x] 122 The sheet's stated height was fiction.
- [x] 123 Six dialogs grew four rem on the desktop and nobody wrote it down. (D129)
- [x] 124 `one-look` had a hole the width of a file, and failed a block comment.
- [x] 125 A comment lied about a field.
- [x] 127 A press on Add company opened nothing, one time in thirty, at a phone width. (D129)
- [x] 126 Six Arabic strings, and one imperative the lint did not list.

Left on purpose, so the next reader does not re-find it: `transition-all` on the kit's button animates colour, a shadow and a one-pixel translate and nothing that lays out, which is what the guideline's warning is about; it stays. And one throw the suite now ignores: React's development build measures a redirected or missing page with a timestamp Chromium refuses ("cannot have a negative time stamp"), and nine specs failed on it in one warm run without a line of the app in the trace; the fixture names that one message and no other, and a production build never emits it (`tests/helpers/i18n.ts`). Speed and reliability, measured (P11I). Two harnesses first — what every screen asks the database (`npm run measure:reads`) and what a mid phone pays to draw the main screens (`npm run measure:speed`) — both against the production build, both keeping a baseline file the next change is held to; then the reads halved where they were repetition, and the unhappy paths walked with the wire cut.

- [x] 128 Every screen read the signed-in user twice and the calendar once per band. (D131)
- [x] 129 A write with no signal became the error card, with the words inside it. (D132)
- [x] 130 Nobody knew what a rep's phone paid to draw a screen. (D133)
- [x] 131 Four font weights shipped for one bold letter.
- [x] 132 A Save whose answer the wire lost made a twin. (D134)
- [x] 133 A session that ended mid-form said "you are not allowed to do that." (D135)
- [x] 134 The prompt dialog painted the number red when the server was not reached.
- [x] 135 The sign-in card jumped when the server was out of reach. (D67)
- [x] 136 The twin swallowed the correction it was meant to protect. (D70, D134)
- [x] 137 Three reads called an action bare, and the lint could not see them.
- [x] 138 The user menu told an expired session it was not allowed. (D135)
- [x] 139 The speed harness could print green having measured nothing.
- [x] 140 An interrupted reads run left the whole cluster logging every statement.
- [x] 141 Three smaller things the second pass found.

Left for the founder, from the measurements and the critic. A request for a quotation or a dispatch has no twin guard: those two writes carry line items, so "the same write" means comparing every line of two papers, and it was not worth doing half. If the wire eats the answer to a request, the coordinator can get two identical papers seconds apart; the rep may withdraw his own (D32) and she may send one back, so nothing is stuck, but nobody is told why there are two. Refuted this box. The withdraw test's `pickFirst` hang (I6, seen once in the 11G gate) did not come back in eight runs of `tests/quotations.spec.ts:608` after the 11H opener fix (#127); it is treated as the same defect and closed. The pinned weekday (P10b) is decided against: the tests that depend on the working week branch on today's weekday and assert both sides (leave, reports, figures, manager), and a clock pinned in the app while the database keeps its own `now()` would split the one definition of today (rules/data.md) — the suite runs on the day it runs.


Left for the founder, measured and not fixed. The document of a list screen is 500 kB decoded on the volume floor — the server-rendered HTML and the same tree again as the payload React takes over — and the phone parses both; the fix is fewer client components per row and less per row, which is a design change to the tables and not a box-11I one. Every screen also fires some twenty prefetches on load (one per link in view, in two flavours), each a server render of the layout with its session read; the reads harness counts the document alone and does not see them. A refusal toast on the phone covers the sheet's own Save button for the seconds it shows. `FormFooter` disables the pressed button while it saves, which is the double-press guard and also drops keyboard focus to the page; and its pending word is "Saving…" whatever the verb was. What a good CRM has that Kladra does not (P11J). Seven readings of the app — the rep's day, the coordinator's desk, the manager's week, the founder's question, the feature surface of the CRMs of 2026, FACET as it was actually used, and the cladding trade in Saudi Arabia — proposed freely; each proposal was then read against the same three questions (whose is it, when in their day, what does it replace) and against the code, and most of them died there. What survived is below; what did not is in DESIGN §4 and §6, with the reason.

- [x] 142 Three fields were written by everybody and read by nobody. (D136)
- [x] 143 The coordinator's desk had two search boxes over one URL, and ran newest first under a caption that says oldest. (D137)
- [x] 144 The coordinator prices projects that have already been given up. (D138)
- [x] 145 A stored code was printed on a screen.
- [x] 146 The palette sent the coordinator to a screen with nothing on it. (D139)
- [x] 147 Nothing said what we lose to. (D140)
- [x] 148 Two clocks on one screen. (D97, D141)
- [x] 149 The strip said the team's gone-quiet total and the table said whose the OTHER figure was. (D142)
- [x] 150 The dispatch was the one record that could not say what had happened to it. (D143)
- [x] 151 Her desk counted itself off two capped arrays. (D80, D95, D141, D144)
- [x] 152 The demo approved two dispatches the day before they were raised.
- [x] 153 The chips over a list were five components, and the row they sit in was four. (D126, D145)
- [x] 154 A picker said something had changed when nothing had, and the dialog waited for ever. (D146; P12)
- [x] 155 A handover moved the company and left the work behind. (D51, D147)
- [x] 156 A share check that was false for ever, and the screen that offered what it refused.
- [x] 157 Whose paper it is was still read off whose customer it is. (D42)
- [x] 158 The dev server ate the machine again, and took a second acceptance run with it.
- [x] 159 The hand-over collided with the very thing sharing exists for.
- [x] 160 Two cards on one screen answered "whose" two different ways. (D42, D86)
- [x] 161 The card the founder asked for drew one bar.
- [x] 162 A migration was generated, recorded, reported successful and never applied.
- [x] 163 A drawer refused work the action behind it would have allowed.
- [x] 164 A UNION subquery answered a name that did not exist, and the screen just asked less.
- [x] 165 A figure truncated into a different figure.
- [x] 166 The dispatches screen closed its own door the moment a customer said yes.
- [x] 167 A refusal that stopped happening rewrote the database for every spec after it. (D91)
- [x] 168 A rep could not edit a customer he had been given.
- [x] 169 The caret never moved, on the two forms tall enough to need it.
- [x] 170 Two figures would have grown a fourth kind without being asked. (P12-7)
- [x] 171 A migration rewritten after it was applied is applied to nothing, in silence.
- [x] 172 A `<bdi>` that is the block is a block that changes direction. (P12-8)
- [x] 173 The rail's own keys were checked by nobody. (P12-8)
- [x] 174 A new namespace is where a second word for an old thing gets in. (P12-8)
- [x] 175 An ellipsis on a LABEL deletes the meaning and leaves the number. (P12-8)
- [x] 176 A CHECK refuses a row only when its expression is FALSE, and `null in (a, b)` is NULL.
- [x] 177 Two screens asked one rule and one of them asked it with a clause missing. (D42, D147)
- [x] 178 A field order the founder dictated, drifted, and nothing could see it.
- [x] 179 The second copy nobody read was the one that was right.
- [x] 180 The compiler found every writer in the app and none of the six in the suite.
- [x] 181 A gap is space; only a mark says "two values". (P12-9)
- [x] 182 A visible heading proves the server answered; it never proves the browser is listening.
- [x] 183 A wait for a list nobody was drawing any more, and the three copies of the helper that waits.
- [x] 184 A state the app could not create, carried by eighteen queries and eight screens. (D94)
- [x] 185 A figure about this morning that somebody else's afternoon could take away.
- [x] 186 One sentence, three keys, and the third found by moving the other two.
- [x] 188 A suite that takes half an hour cannot be started at midnight.
- [x] 187 The same hole, one letter over: a checker that cannot see through a prefix.
- [x] 189 Stopping a run stopped the shell in front of it, and nothing below it.
- [x] 190 The pattern was already there four times; the box was about to write it a fifth.
- [x] 191 A number the row shows and a number the row points at are the same question.
- [x] 192 A number that names something is not a number, and only two places knew.
- [x] 193 The same rule as `<bdi>`, one attribute over, found by looking at the Arabic.
- [x] 194 Two halves of one sentence, built ten phases apart and never joined.
- [x] 195 A figure whose words said something its query did not. (D59)
- [x] 196 A third read of the small table, and a second walker over it.
- [x] 197 The busiest day anybody in the demo had ever had was three entries.
- [x] 198 Three things the Arabic reviewer found that the English side owned.
- [x] 199 Two things only a screenshot could say, on states nothing had ever drawn. (D55)
- [x] 200 A comment that answered a question the founder had already answered, three times over.
- [x] 201 Four screens drew the same drawer and agreed about none of it.
- [x] 202 Two screens answered "one sentence and its primary action" by drawing the action twice. (D35)
- [x] 203 The half of a founder sentence that looked already done. (D98)
- [x] 204 Taking a feature out left its supporting cast behind.
- [x] 205 A memory that outlives its browser outlives its test.
- [x] 206 A test fixture that builds a row by hand is a second schema, and it drifts. (P13-S0)
- [x] 207 A contrast failure that only one theme and one surface could show. (P13-S1)
- [x] 208 A screenshot cannot prove a scrollbar: the headless browser hides them. (P13-S1)
- [x] 209 A worktree inside the repo is inside every watcher, type check and lint the repo runs. (P13 Stage 2)
- [x] 210 The dialog reported narrow twice was one class on the shared shell, not the form. (P13-S2)
- [x] 211 A colour code in a field that follows the page's direction lost its last digits in Arabic. (P13-S2)
- [x] 212 A heading found by a word the page also uses in its own counts found eight headings in English and one in Arabic. (P13-S4)
- [x] 213 Two drawers called the same tab by two names, and a test that knew only one of them. (P13-S4)
- [x] 214 A file a screenshot agent wrote for itself was swept into a commit by `git add -A`. (P13 Stage 2)
- [x] 215 A primary action hidden from the one person its new half was for: no paper, no button, no Direct. (P13-S3)
- [x] 216 A retry that retried everything except the press that failed. (P13-S3)
- [x] 217 A row found by the text "Q-1" is also the row for Q-11, the day the seed grows past ten. (P13-S10)
- [x] 218 A worktree made for a builder can start at an old commit, not at the branch it was made from. (P13 Stage 2)
- [x] 219 A seed that mixes a fixed day of the month with working days back is honest on some days of the month only. (P13-S5)
- [x] 220 A sticky bar inside a card that hides its overflow sticks to the card, not to the page. (P13-S7)
- [x] 221 A count drawn beside a capped list counted the rows it drew, not the day. (P13 G2 review)
- [x] 222 A spec that says a shared reader sees no action row outlived the slice that gave him one. (P13 G3)
- [x] 223 A browser that translates the page rewrites text React owns; the founder's Edge dropdowns were that. (P13-S11)
- [x] 224 One seventy-minute suite on a dev server is a run the machine kills; four short ones are a gate. (P13 G5)
