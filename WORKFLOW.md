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
- [x] P9 Think, then deepen — Jerom's second pass after using it (adds to SPEC §3, replaces nothing)
      - [x] P9.1 Five days walked end to end, judged against the sheet, ranked list written here (9A)
      - [x] P9.2 The schema read as a critic and fixed while the data is still fake (9D)
      - [x] P9.3 The daily report: the system writes most of it, the person adds what it cannot know (9B)
      - [x] P9.4 Numbers that answer a question somebody asks daily, and say what they mean (9C)
            - [x] a The caption slot, and the coordinator's queue: a wait is a length, not a date
            - [x] b One figure, one name, one definition — the labels audited across every screen
            - [x] c m² by month, so there is a month before this one
            - [x] d Where quotations die
            - [x] e Which companies went quiet
      - [x] P9.5 The login screen, and the identity audited as a whole (9E)
            - [x] a The sign-in screen, built to the app it opens
            - [x] b A person is named in the reader's script
            - [x] c The rest of the identity, audited screen by screen
      - [x] P9.6 The 9A list built, best first, and the ideas that only sounded impressive left out
            - [x] a A log entry can be corrected, and unfiled (item 3)
            - [x] b The rep logs the call without leaving his day (item 4)
            - [x] c A quotation's history, and the reason that outlived it (item 5)
            - [x] d Every quotation line is typed from nothing (item 7)
            - [x] e Leave is invisible everywhere except the pace arithmetic (item 9)
            - [x] f A revision does not say what changed (item 10)
            - [x] g Nothing says whether the team is using the app (item 12)
- [x] P10 The half-built and the carried, then a pilot on real volumes
      - [x] a A person has a standing strip of his own — the one thing "how is this going"
            is not asked about anywhere
      - [x] b A notification that has been read and acted on stops being a row for ever
      - [x] c The carried three: every list renders every row it is given, a form dialog
            that scrolls does not say so, and a dispatch is typed from nothing too
      - [x] d The pilot: the acceptance scripts walked at the founder's volumes
            (`npm run seed:volume`), what broke fixed, what was measured written here
- [x] P11 Independent review and hard polish — a different model reads it as a stranger,
      owns it, and does not stop. The specs stay green; a rule that changes takes its test
      and its reason with it, said out loud.
      - [x] A Read it as a stranger, build nothing yet: schema, actions, screens, seed,
            tests, a full day for each of the five people; a ranked findings list in §5
            with the cause of each, not the symptom; then fixed worst first in slices
            — the list is written (§5, sixty-seven entries, unverified); fixed so far:
            1, 2, 6, 57 (a write holds its row, D85); 3, 4, 46, 52 (achieved is the
            raiser's, the formula written once, D86); 7, 8, 44 (a terminal action
            records what it did, D87); 5 (a typed key refused by name and corrected
            in place, D88); 9, 13 (a phone read in its country, a month sentence that
            matches its bars, D89, D90); 10, 11, 12 (a role and an id, a child restored
            onto its company, a backup held to its own counts, D91–D93); 15, 16, 21 (a
            drawer says what it writes, D94); 22, 23, 24 (a figure agrees with the figures
            under it, D95); 14, 19, 25 (the guards, D96); 26, 30, 32 (a day as it happened,
            D97); 29, 31, 39 (a number is a call, D98); 36, 37, 38 (derived from the source,
            walked in the spec, D99); 42, 43, 55, 56 (the database says what the code assumes,
            D100); 45, 58, 65, 67 (what it says it is, D101); 48, 59, 60 (one word for one
            thing, D102); 47, 49, 50, 62 (a test that cannot pass for nothing, D103); 61 (the
            volume floor has a past, D104); 11B: 17, 18, 54, 63, 64 (live is proved, D105);
            11C-1 (closed where the code is closed, D106); 11C-2 (reads measured at the
            volume floor, D107); 11D-1: 72 (a count counts the rows its list shows, D108); 11D-2: 73 (a
            company that comes back is recognised, D109); 11D-3: 74 (a notice names the
            customer, D110); 11D-4: 75 (a call card says why, D111); 11D-5: 76 (a dispatch line says what
            already went, D112); 11D-6: 77 (a day off the calendar is a span, D113); 11D-7: 78
            (Enter saves what a person typed, D114); 11D-8: 79, 80, 81 (a form starts from what
            the app knows, a queue row names its person, D115, D116); 11D-9: 82 (a typed line
            starts where its row starts; the targets row wraps alike with or without last
            month's figure — both seen in the box's own shots); 11E-1: 83, 84, 91 (a count is
            a door, the pace cell in words, a sum of estimates whole, D117); 11E-2: 85 (stopped
            work first, the heading's doors, D118); 11E-3: 86 (the queue says the paper was
            revised, D119); 11E-4: 87, 88, 89, 92 (the window in words, nouns counted, the m²
            named, D120); 11F-1: the question each screen answers and every board move
            written as tables in DESIGN §6; 11F-2: 93 (a warning that names a record is a
            door to it, D121); 11G-1: 20 (error and missing screens are Kladra's, D122);
            11G-2: 34, 66, 102 (a look asked for by name, current is a wash, dialogs in the
            band, D123); 11G-3: 40, 41, 53 (the rail, the chrome and the splash decided
            before the first byte, D124, D125); 11G-4: 94, 101 (a pressed link says it is
            working, D126); 11G-5: 95, 96, 97, 98, 100 (empty says why, D127); 11G-6: 99
            (a search term without a digit took three lists down); 11G-7: 103, 104, 105
            (the guidelines pass: the hover is not the wash, the mark speaks, the menu
            is named); 11G-8: 106, 107 (the critic's pass: the cookie guarded, the
            Arabic digit found)
      - [x] B Prove live updates end to end, two people, no reload — quotations, dispatches,
            notifications; a dropped connection, a sleeping laptop, two tabs, a server
            restart — and make it a permanent test
      - [x] C Database and data honesty, read as a critic: shapes, constraints, indexes,
            figures computable two ways, history worth keeping; then the messy realities;
            migrations proved from information_schema
      - [x] D The whole flow, creation to oversight, walked step by step: what is retyped,
            how many clicks, what a person must remember, where two screens could disagree
      - [x] E Dashboards and reports audited as products: one look, no interpretation,
            every figure saying what it means; charts where a shape is clearer than a number
      - [x] F A view per screen, chosen not copied, the question each answers written in
            DESIGN; drag only where the drop needs nothing the system does not already have
      - [x] G Identity, motion and feel audited as one thing; loading, empty, error and
            offline states on every screen; reduced-motion honoured
      - [x] H Phone: a rep with one hand free at 375 — log, call, quote, read what came back
      - [x] I Speed and reliability, measured: first paint on a mid phone, ten thousand
            rows, queries that grow, the unhappy paths — nothing silent, nothing lost
      - [x] J What a good CRM has that Kladra does not: proposed freely, then deleted down
            to what names a person, a day and what it replaces; the rejected list kept
            (DESIGN §7) — 11J-1: 142 (a field that is written is read somewhere, D136);
            11J-2: 143 (one search box per screen, her desk in her order, D137); 11J-3:
            144, 145, 146 (the desk knows what it is holding, a stored code is never a
            word on a screen, a hit opens something for whoever pressed it, D138, D139);
            11J-4: 147 (why we lose, D140); 11J-5: 148, 149 (one clock for lateness,
            whose customers have gone quiet, D141, D142); 11J-6: 150, 152 (a dispatch says
            what happened to it, D143; and the demo record it turned out nothing had ever
            read in order); 11J-7: 33, 151 (a figure is not the length of a capped list,
            D144); 11J-8: 153 (one chip over a list, in one row, D145)

P3.5 before P3.6 on purpose: P3.6's terminology sweep and its "one sentence per rejected input"
rule have to cover the edit screens too, and sweeping twice is how a second definition survives.

**Where I stopped:** P11A is down to the entries that belong to later boxes. The stranger read
is done and ranked — §5 below, seventy entries with causes — and seventeen slices fixed the
worst in order, each verified in the code before it was called a defect: D85–D104 (a write
holds its row; achieved metres are the raiser's and the m² formula written once; a terminal
action records what it did; a SMAC number refused by name and corrected in place; a phone in
its company's country and the six-month sentence true of its bars; a permission is a role and
an id, a child restored onto its company, a backup held to its own counts; a drawer says what
it writes; a figure agrees with the figures under it; the guards; a day as it happened; a
number is a call; derived from the source, walked in the spec; the database says what the code
assumes; what it says it is; one word for one thing; a test that cannot pass for nothing; the
volume floor has a past). What remains in §5 is parked on purpose: 17–18, 54, 63–64 are 11B
(live updates), 34, 40, 41, 53, 66 are 11G (identity, motion, states), 27, 28, 35, 51 are 11H
(the phone at 375), 20 is 11G. The last two were carried to the end of the phase: 33 is
fixed in 11J-7 (D144) and 68 is closed below as what it is, a rule about long-lived dev
servers rather than a defect in Kladra. Box 11B is done in one
slice (D105): two people, no reload, in `tests/live.spec.ts`, timed; every list marks an
arrived row, and the mark's two seconds start when the row is on screen (timed on the page's
own clock); the channel and the count open for a viewer; a listener outage ends with one
resync; the chunking branch ran against four hundred. Box 11C is done in two slices, one
commit (D106, D107): three more free-text columns closed where the code is closed, the trail's
eighteen record kinds derived rather than copied, migration 0012; one archived company in the
demo so the archive rule's second half and the archive screen have a row; the schema file and the
catalogue held to each other both ways in `tests/schema.spec.ts`; every screen's reads logged
and explained at the volume floor, one index added where a plan grew per row, the baseline
written in §3 and the round-trip count parked for 11I as §5 #71. Box 11D is done in nine slices, one
commit (D108-D116): the flow walked in the code and counted (§3 "The flow, counted"), ten
findings written with their causes (§5 #72-81) and all ten fixed with a spec each — a count
counts the rows its list shows; the archive is read when a company comes back; a notice names
the customer; a call card says why; a dispatch line says what already went; leave is a span;
Enter saves; a form starts from what the app knows; a queue row names its person — and one
more (#82) seen in the box's own shots: a typed line starts where its row starts. The walk's
own fan-out was the lesson of the box: nine readers rebuilding one context spent two million
tokens and returned nothing, and the routing rule in §1 came out of it. Box 11E is done in
five slices, one commit (D117-D120): the five dashboard screens read in the code and shot at
volume, ten findings (§5 #83-92), eight fixed with a spec each and two refuted with the reason
written — a count is a door; the pace cell says its unit; a sum of estimates is whole; stopped
work sorts first and the heading's doors say of what kind; the queue says a paper was revised
before the press; a figure's window is in its words; a noun after a number is counted; the m²
is named. Box 11G is done in one commit (D122–D127): the six parked findings closed — error and
missing screens inside the shell, no default look on a button or a badge, the board's current
card a wash, the rail's width and the browser's chrome and the offline splash decided from the
cookie before the first byte — and what the two inventories found on top: a pressed link says
it is working, every empty state says why, and a search term with no digit in it no longer
takes the quotations, dispatches and queue lists down (§5 #94–#102). Box 11H is done in one
commit (D128–D130): the four parked findings closed — one phone line named once and held by the
lint, every form a bottom sheet with Save lowest and a thumb tall, 44px on everything a thumb
presses — and what walking the four flows at 375 found on top: the Add project sheet named no
company, the library's sheet slid in 500 ms, and a sheet with words in it could be swiped away
(§5 #108–#127). Box 11I is done in one commit (D131–D135): two harnesses with a baseline the
next change is held to — `measure:reads` (459 → 400 statements over 43 screens once the session
user and the calendar were once-per-request reads) and `measure:speed` (a cold screen live in
2.9–3.5 s on a slowed phone for 467–582 kB once the fourth font weight was dropped) — and the unhappy
paths walked with the wire cut: a rejected action was the error card with the words inside it
and is one guard on every call now, a Save pressed twice after a lost answer is one write, a
session that ended says so (§5 #128–#135). The figures measured and not acted on — the 500 kB
list document, the twenty prefetches a screen fires, the two request writes with no twin guard —
are under "Left" in §5. Two critic passes ran over the slice and both were acted on: the first
found the guard's holes (§5 #136–#138), the second found that the speed harness could print green
having measured nothing and that an interrupted reads run left the whole container logging every
statement (§5 #139–#141).

Box 11J is done in eight slices, eight commits, and Phase 11 closes with it. Seven readings
proposed sixty things and eight survived the three questions — who, when, and what does it
replace. Two more decisions came with them from older entries the box was the last chance to
close, so §5 #142–#153 carries ten with their causes, and the refused list is kept by class in
DESIGN §7. Both things parked for the box are done: the four hand-drawn search boxes are one
component (§5 #121 → #143) and the quotations chips that wrapped round the list/board switch at
375 are one component in one row (§5 #153, D145). Two defects were found by critic passes over slices that were
already green, which is the habit worth keeping. §5 has no open entry left: 33
is fixed in 11J-7 and 68 is closed as a rule about dev servers rather than a defect.

**What is not done, and it is not code.** Not one of these screens has been in front of the
person it was built for. The process rule in CLAUDE.md says a screen is done when its user has
tried it — Faisal, Rawan, Abdulrahman, Jerom — and a suite of 475 checks in two languages is not
that. The next phase begins there.

The dev database is seeded at volume (`seed:demo` then `seed:volume`); `seed:demo` alone puts it
back. A dev server that has served a session's edits is restarted, not reused (§5 #68).

**Where P9 stopped.** P9.1–P9.5 done. 9C ended with four causes fixed rather than four
figures added: a URL filter that parsed to nothing because the vocabulary lived in two
lists (D64), a chart label truncated into a wrong year in Arabic (D65), a demo whose
company target hid two of the three pace colours (D66), and the gone-quiet band itself
(D63). 9E was the same shape: the sign-in screen was the last one built to rules the app
had outgrown (D67), a person is named in the reader's script now rather than in Latin on
every Arabic screen (D68), and the identity audit found the primary button written by
hand in fourteen files and every floating surface drawing a ring where the app draws a
border (D69). The mid-session sign-out seen during the 9C screenshots was confirmed as
`seed:demo` truncating the `sessions` table under a live browser — correct behaviour that
looks exactly like a bug, so the README says so now.

P9.6 is the 9A list itself, best first, and all seven of its boxes are done — every
item on the ranked list that was still open. A log entry can be
corrected by its author and unfiled onto the audit line (D70), he logs the call from the
row he called from (D71), and a quotation now remembers what happened to it (D72). The
third one found the defect underneath it: a reason that outlived the state it explained,
on a column whose twin on the dispatch table had been guarded by a constraint since the
schema was written. Item 7 is done too: Add item opens on the sheet above it, and a
customer who has been quoted before is offered his last quotation to start from (D74).
Item 9 is done: a rep on leave is named on the manager's screen and what is due on his
floor is listed beside him, and his own day says who has it while he is out (D75).
Item 10 is done: a revision names what it changed from the quotation it was raised on,
above the lines, where she reads it before pricing them (D76).
Item 12 is done: the admin's own screen says who last opened Kladra and what each person
changed this week, counted from the audit log (D77).

**P10a is done.** A rep's floor carries its own band of three — pipeline, open quotations with
the part the customer is holding beside it, and what has been sent back or refused — between the
month card above it and the calls due below (D78). The manager reads it by pressing a name on the
team screen, the rep reads the same band on his own floor, and the two counts come from the list
his day already renders rather than from a second derivation of it. Two things were fixed at the
cause while building it: "open quotations" existed twice, once in SQL and once in the query
builder, and the strip's phone grid left an empty cell beside an odd last figure — the same defect
as the half-empty two-figure strip in P9.6g, one width down, and now a rule in DESIGN §5.

**A model change, at P10c's gate.** Fable 5.1 took over from Opus 5 with the P10c slice built
and its suite running. The charter's rule for this applies: the previous model's work is
another developer's, and P11A is where it is read as such before anything is built on it.
The ordering change the founder asked for — lists capped before any volume testing — was
already the shape of P10c, so P10d runs on a floor whose lists say what they left out.

**P10c is done, and with it the carried list.** Every list on the app asks for what its
screen will draw and says what it left out (D80): two hundred on a list screen, twenty-five
in a band of the day, twenty in a group of the stuck list, with the true total beside it and
the search box named as the way to the rest. The one list deliberately left whole is a
company's own activity, because that history is the record and the export does not carry it.
The same sentence fixed the form dialogs: a body with more below the fold now says so, in
four lines of CSS on `FormBody` and therefore in every dialog at once. And a dispatch starts
from the last one raised against its quotation — the site, the terms and the method, with
the quantities left empty (D81).

**P10d is done — the first walk at the founder's volume.** `seed:volume` had never been run:
it was written against column names nobody checked (`countries.iso2`, `panel_classes`) and
fell over on its first query. Fixed, it puts 828 companies, 432 projects, 348 quotations
and 255 dispatches on the floor, Faisal holding 288. Every query was cheap at that size —
nothing on the day screen took more than 6 ms warm — and the screen was still the slowest in
the app, three times the two-hundred-row customer list beside it: 1.56 s and 1.04 MB in
development. The cause was not data but shape. The day screen mounted a whole log dialog
behind every one of a hundred cards, and drew the cards as a server loop over client
leaves, so the page carried each card twice — once as HTML and once as props. The same
shape was under the manager's stuck list and, worst, under a company's history, the one
list left whole on purpose: three hundred entries made a 1.68 MB drawer that took two
seconds. One dialog per screen now (`LogDialogHost` / `LogButton`; the trigger-owning
form is gone so the per-row shape cannot return), and every long card list is one client
component drawn from data (`CallBand`, `WaitingList`, `StuckRows`, `ActivityList`) — the
rule is in DESIGN §5 and D82. Measured before and after, development, warm: day 1.56 s →
0.49 s and 1.04 MB → 0.56 MB; team 0.71 s → 0.50 s; the 300-entry drawer 2.0 s → 0.6 s and
1.68 MB → 1.09 MB. In production (`next start`, warm, three runs each) every screen at this
volume answers in 20–60 ms and weighs 24–80 KB gzipped — day 52 KB, customer list 66 KB,
team 33 KB, the drawer 80 KB — so nothing here is slow on a phone; the point of the change
is what the browser has to hydrate, and that a history that grows for years stays flat.

The walk itself, by shot-looker at 1366 and 375, en and ar: every capped list ends with its
line and the figures agree — "The first 200 of 288 are here" on the customers, 347 quotations,
255 dispatches; the bands say "Overdue 30 · and 5 more", "Never contacted 102 · and 77 more",
"Gone quiet 87 · and 62 more", and the Arabic «و77 أخرى» reads right-to-left with Western
digits in order; the stuck groups say "and 258 more"; no horizontal scroll at 375 anywhere;
the scroll hint in a form is present in both themes and fades at both ends, measured in
pixels, and the Totals card under it is whole. Two things it found were real and are fixed:
"Waiting on you" was the one band with no cap and put sixty-four cards above the calls (D83);
and "gone quiet" — 249 on this floor, the largest group on the manager's screen — had no
figure in his strip, so it is the fifth (D83, the numbers spec now counts five). Two were
not defects: Turki's Latin name on the Arabic screen is the seeded rep with no Arabic name
(D68, on purpose); "Waiting" and "Sent back" sharing amber is DESIGN §6, both wait on
somebody. Left for later, said here rather than hidden: the Unfile confirm on a history entry
is still one dialog per row — it carries a closure per row and costs hydration only, not
payload, so it waits for a phone measurement in 11H/11I; and the volume seed makes every
project "Open" and has no lost ones, which a later walk of the projects screen should fix. The design-guidelines pass over the five new files found seven things: five fixed — Save
moves the cursor to the refused box, a typed log form no longer closes on a tap beside it
(D84), the waiting cards took the focus ring their siblings had, their names clip inside the
card, and the middle dots on stuck rows are hidden from screen readers — and two declined
with the reason in D84: virtualising the history, and an ellipsis convention on placeholders
that the app does not follow anywhere. The critic pass then read the whole slice as a
sceptical stranger and found four real things, all fixed before the commit: the waiting cap
was keeping the newest twenty-five (each source listed newest-first, and the three were
never ordered against each other), so the oldest sent-back quotation would have been the
first hidden — it is ordered by when each stopped now, and a spec pushes the floor past the
cap to prove it; the fifth tile broke the strip's own four-column contract and sat alone in a
quarter of a second row — the strip takes five now, two columns to `lg`; an open log form
read its company off a live prop, so a refresh from a live update could unmount it under a
half-typed entry — the target is snapshotted at the press; and the drawer still mounted two
hosts with the same contacts and projects — one host per drawer now, at the root, with the
header's and the history's buttons pressing the same form. Smaller ones with it: the
outside-tap guard covers every field and not only the words, the empty state of a history
sits inside the host, the band key is a union of the four names, and the measurements in
DESIGN say which change they measure. The gate then failed on two tests this slice never touched, and the calendar
was the reason: every run before had fallen on a Friday or a Saturday, so the manager's leave
test returned early with nobody away and the daily-report test counted a Thursday nothing had
been logged on. On the first Sunday both asserted for the first time in weeks and both were
wrong — the leave test's first text match was the phone copy of the team table, hidden above
`md`, and the report test counted unfiled entries the figure rightly leaves out (D70). Both
locators and the SQL are corrected; no rule changed. A test that only asserts on a working day
is a test that is quiet five days in seven — 11I should run the suite on a pinned weekday.

**P10b is done.** A notice says what it is ABOUT rather than only where the screen is, and every
kind answers one question the compiler asks of it: what takes this off the screen (D79). Work is
cleared by the transition that settles it, inside the same transaction, so the bell drops when the
thing it described stops being the case; a finished fact is cleared by being read, because there is
nothing else to do with it. What is left after "Mark all read" is the work still open. Two more
causes went with it. The notification row was the one place in the app that stored a person's NAME
rather than joining for it, so an Arabic screen read «طلب Faisal Al-Harbi» — the row carries his id
now and `one-name` fails on a Latin name taken off the session, which is the shape neither of its
first two checks could see. And the coordinator's typed reason was a clause inside a sentence built
from the message file; it is a block of its own under it, in the direction of whoever typed it,
which is the rule DESIGN §5 already carried for every other screen.

**P9 is finished, and with it every item on the ranked list the five days produced.** What
is next is P10, and it is the three things this phase deliberately did not do, in this
order: the two half-built ones the walk named — a standing strip that answers "how is this
going" for a company and a project but for no PERSON, and notifications that are created
and never expire — and then the carried list below, which has grown to three. After that
the app is ready for a pilot rather than for another feature: a run through every
acceptance script with the founder's own data volumes, not the seed's.

**Carried, new in P9.6d:** a form dialog that scrolls does not say so. Measured on the
request form: one item fits exactly, two do not, and the totals and the note to the
coordinator go below the fold with the footer still visible above them — so it reads as if
the form ends at Add item. Nothing is lost and the scroller works; Chromium's overlay
scrollbar simply fades, and every dialog in the app and every one of them at 375 has the
same shape. The fix is one scroll affordance on `FormBody`, which is four lines of CSS and
a visual change to every dialog in the app — a forms pass, not a line inside item 7.

A dispatch is typed from nothing too. The destination and the
payment terms are free text on every one, and a second dispatch against the same quotation
goes to the same site on the same terms — the identical complaint one screen along from
item 7. It is NOT on the ranked list and no user named it, so it is written here rather
than built: the five days found it at the quotation, and the dispatch form has not been
walked with a rep.

**Carried, and still carried:** every list in the app renders every row it is given —
`listCompanies`, `stuckList` and the four call-list bands have no LIMIT. It is NOT on the
ranked list below, because the five days were walked on a seeded floor where no list is
long enough to hurt; it came out of the interface-guidelines pass instead, and P9.6 weighs
it against the twelve that are. The apostrophe question went into 9E and is done: English
copy uses `’`, and the message checker fails on a typewriter one.

Three checks were added to the gate across these two boxes, each after the defect it would
have caught: the message checker reads the specs, because a key three of them named had
moved and only a ten-minute suite noticed; `one-name` fails on a query that names a person
in Latin on a screen, and found three the hand sweep had missed; and `one-look` fails on a
primary button written as a class string or a surface drawn with a ring.

The five days were walked before any P9 code and the ranked list is §4 below. Its first item was
the daily report, and it is built: the system assembles the day — log entries, companies, quotation
and dispatch requests, what came back, the customer's answers, dispatches approved, m² moved, calls
due against calls followed up — and the only thing a person types is one box of free text. One
screen for the whole floor, alphabetically, the manager reading the same page everybody else does.
A missed day is one dashed empty box with no colour on it, and a day nobody worked is not a missed
day (D55-D57).

Three causes were fixed rather than their symptoms. The write window was "today and yesterday",
which in a Fri-Sat week meant that on a Saturday nobody on the floor could write anything at all —
it is the last WORKING day now (D58), and the rule is in `.claude/rules/data.md`. A block of text
somebody TYPED was being laid out in the page's direction rather than its own, so an English log
entry sat flush against the right margin of an Arabic card; `<Prose>` owns that everywhere now, and
it was three older screens as well as this one. And the labels this screen builds from a table were
invisible to the both-locales check, the same blindness that printed `common.marketing` on every
screen in P8 — `check:messages` reads that table too now, and was proved to bite.

`tests/reading.spec.ts` sweeps `/reports` as of this phase, and caught the date navigator on its
first run: a date carries a month NAME, and it had been written with `dir="ltr"` and the mono figure
face. A new screen goes on that list the day it lands.

**Where P8 stopped.** P8 done. Jerom used Kladra himself and asked for depth rather than
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

**Who runs on what** (founder, 11D). Bounded, mechanical work with an exact file list and a
schema — an inventory, a count, a grep matrix, a spec written and run, a screenshot read — goes
to sonnet (test-runner, shot-looker, or a general agent handed the files). Judgement — a cause, a
rank, a refutation, a design, a rule — stays in the session (fable); Arabic register stays with
arabic-reviewer (opus). The session reads the authority files once and passes the extract in the
prompt; a fan-out never hands the same documents to eight readers to rebuild. Never more than
three agents at once. A workflow opens with one scout whose result decides whether the fan-out
is worth its tokens, and a read the session can do in a few `grep`s is not an agent's job.

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
7. Raising a second dispatch against the same quotation opens on the first one's destination, terms and shipment method, with every quantity box empty (D81).
8. Second test: a request for more than a line has left is refused at the field as it is typed, and refused again by the action — the second one is the enforcement that counts.

Faisal's Home target card (the old step 4) lands with P6, which is where the card exists.

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


## §5 What a stranger found (P11A) — ranked, with causes

Twelve readers, each a fresh model given one lens and told to read Kladra as another
developer's work: write paths, schema, the queue, Faisal's day, admin and backup, the team
figures, live updates, hand-over and floor rules, seed and tests, words, identity, the phone.
Seventy-three findings, sixty-seven after merging what two readers saw. The refute pass that
was to follow them hit the usage limit and never ran, so **every entry below is unverified
until the fix reads the code** — the worst ones first, and each fix slice starts by checking
the claim. Where a reader quoted the code the entry says so; where two readers disagreed the
entry says that too. Fixed items are ticked and dated in place; the list is not rewritten.

Rank is by consequence to the people: wrong metres or money, silent loss, a screen that
lies, a write that can corrupt, then a screen that confuses, then hygiene.

- [x] 1 **Two dispatches can spend the same panels.** Verified and fixed in P11A-1 (D85). `src/actions/dispatches.ts:173-212`
  `checkQuantities` is a plain SELECT under READ COMMITTED with no row lock; two Saves at once
  both pass and both commit. Cause: the check is at the door and the door is not locked. Fix:
  lock the quotation row for the transaction, and a test that races two requests. Two readers
  cited the code; a third called the same function "correctly re-verified" — verify first.
- [x] 2 **A dispatch already waiting is never re-checked against a later revision.** Verified; approval refuses a superseded one now (P11A-1, D85); the queue badge waits for 11E.
  `src/actions/dispatches.ts:461-528`. D36's rule runs only when a dispatch is raised; Rawan
  can approve one against a price the customer no longer holds. Fix: re-check the live revision
  at approval and say so in the queue. Reader cites code.
- [x] 3 **A hand-over rewrites past months' achieved metres.** Verified; achieved follows `dispatches.rep_id` now (P11A-2, D86). `src/lib/dispatches.ts:585-603`,
  `src/lib/months.ts:67-73`. Achieved joins the CURRENT `companies.rep_id`, so moving a
  customer moves his history to the new rep. Cause: no attribution at the time of the sale
  although `dispatches.rep_id` already holds it. Fix: attribute to the rep who raised the
  dispatch (decision for SPEC §4). Reader cites code.
- [x] 4 **A quotation names the rep who no longer owns the company.** The label says "Raised by" now, which is what the column holds (P11A-2, D86). `src/lib/quotations.ts:
  196-207`, `src/actions/companies.ts:407-411`. `quotations.rep_id` is frozen at creation while
  the floor moved. With 3 decided, the display is right and the sentence beside it must say
  "raised by". Reader cites code.
- [x] 5 **A SMAC number cannot be corrected, and a duplicate says "something went wrong".** Verified; a clash names its holder at the field and the coordinator corrects the number in place — and the contact form's duplicate-phone answer had the same fault underneath (P11A-4, D88).
  `src/db/schema.ts:374-391`, `src/actions/quotations.ts:388-446`, `src/actions/dispatches.ts:
  461-528`; contrast the phone-duplicate handling in `src/actions/contacts.ts:27-31`. The one
  value the spec itself calls error-prone has no named error and no way out of a typo. Fix: a
  named 23505 check that says which record holds the number, and a correction path. Two readers.
- [x] 6 **Six status transitions have no compare-and-swap.** Verified — seven, with withdraw — and every one holds its row now (P11A-1, D85). `src/actions/quotations.ts:409-413,
  479-484, 558-562`, `src/actions/dispatches.ts:486-495, 563-567`; contrast `companies.ts:
  460-466` which guards its UPDATE with the expected prior state. A second tab overwrites a
  decision silently. Fix: `where status = expected`, check the returned count, say "somebody
  already acted — reload". Two readers cite code.
- [x] 7 **Archiving a company records no reason.** Verified; it asks why, keeps it, and the archive screen shows it (P11A-3, D87). `src/db/schema.ts:218-252`, `src/actions/
  companies.ts:451-479`. Every other terminal state got a reason column or audit details; S16
  promised "the record shows why". Reader cites code.
- [x] 8 **Unfiling an old entry rewrites a reported day.** Verified; unfile takes the correction's window, in the action and on the button (P11A-3, D87). `src/actions/activities.ts:219-245`
  vs `308-341`: edit checks `mayWriteFor(day)`, archive never does, and the button is always
  offered. Fix: the same gate on both, and the button only while the day is open. Reader cites code.
- [x] 9 **Phones are normalised as Saudi whatever the country.** Verified; every caller passes the company's country now, and the eight-digit fallback is gone (P11A-5, D89). `src/lib/phone.ts:34-47` and
  its three callers; the country is in scope at every one. Fix: pass it. Reader cites code.
- [x] 10 **A promoted account keeps its floor for ever.** Verified; `mayWrite` asks the role too, and a floorless role is refused while companies remain (P11A-6, D91). `src/lib/floor.ts:51-54` `mayWrite`
  checks identity only; its sibling `mayQuote` checks the role too. Fix: require a floor-holding
  role, and make a role change force a hand-over. Reader cites code.
- [x] 11 **Restoring a stray archived contact un-archives its company as a side effect.** Verified; a child under an archived company gets a sentence, not a button, and the action refuses too (P11A-6, D92).
  `src/actions/admin.ts:601-630`. Fix: restore the child alone when the company was archived on
  its own, and say what the restore will do. Reader cites code.
- [x] 12 **`backup:verify` fails on any day the business used Kladra.** Verified; counts are recorded with the dump and the restore is held to them (P11A-6, D93). `scripts/backup-verify.ts:
  169-196` compares the live database now against a dump from earlier. Fix: capture the counts
  when the dump is taken. Reader cites code.
- [x] 13 **The six-month card calls a month "the first with anything" while its own bars say
  otherwise.** Verified; first, after-empty and nothing are three sentences now (P11A-5, D90). `src/lib/months.ts:116-132`, `months-card.tsx:74-84`: null percent comes from the
  previous month alone. Fix: first only when every earlier month is nought. Reader cites code.
- [x] 14 **D84's guard does not cover the phone's back gesture.** Verified; the dirty sheet holds one history entry and the gesture lands on it (P11A-9, D96). `log-dialog.tsx`: a route
  change loses the typed entry. Fix: a popstate guard while dirty. Reader cites code.
- [x] 15 **The drawer's follow-up picker cannot clear a badge a project drives, and says it
  did.** Verified; the drawer names the project's date and the toast stops pretending (P11A-7, D94). `src/lib/followups.ts:85-93`, `company-header.tsx:168-194`, `actions/companies.ts:
  305-333`: the badge is least(company, projects); the picker writes the company only. Reader
  cites code.
- [x] 16 **A quotation raised from the company drawer belongs to no project, by default.** Verified; the drawer asks which project, offers nothing when there is none, and the action refuses (P11A-7, D94).
  `company-drawer.tsx:377-384`, `request-quotation-dialog.tsx:184-274`, `actions/quotations.ts:
  205-254`; SPEC says every quotation belongs to one. Reader cites code.
- [x] 17 **A Postgres blip longer than one reconnect loses live events with no resync.** Verified in the route — readers who connected during the outage sat on a hub with no listener; a `resync` event when it returns (11B-1, D105).
  Seen beside it (P11A-5, a test run's server log): `Error: The destination stream closed early.`
  four times per locale project, each as a drawer closed in rep.spec — the SSE route does not
  close cleanly when the browser drops it. Same file, same slice when 17 is taken.
  `src/app/api/events/route.ts:92-174`, `live-provider.tsx:122-130`. Fix: broadcast a refresh
  when the listener heals. Reader cites code. (11B territory.)
- [x] 18 **`requireActor()` gates the SSE and count routes, so live updates 401 during
  "view as".** Verified; `requireReader` (11B-1, D105). `events/route.ts:162-169`, `authz.ts:105-111`, `notifications/count/route.ts:
  15-20`. Fix: a read-only identity check for reads. Reader cites code. (11B.)
- [x] 19 **CSV cells are not neutralised against a leading `=`, `+`, `-`, `@`.** Verified; a cell Excel would run is written as text, numbers pass (P11A-9, D96). `src/lib/
  export.ts:28-32`. Reader cites code.
- [x] 20 **No error boundary in the signed-in app.** Verified; one card inside the shell for the screen that threw and the address that names none, a bare one above the shell, a static one above the root (P11G-1, D122). No `error.tsx` anywhere; `loading.tsx`
  exists. Fix: a themed, bilingual error page in the shell. Reader cites absence. (11G.)
- [x] 21 **Edit and unfile of a log entry never call `notifyLive`.** Verified; both send the event a new entry sends (P11A-7, D94). `activities.ts:276-296,
  320-337`; every other write does. Reader cites code. (11B.)
- [x] 22 **The adoption headline counts people the same screen excuses as away.** Verified; one predicate for the headline and the rows (P11A-8, D95). `src/lib/
  adoption.ts:74-112`, `use-panel.tsx:118-132`. Reader cites code.
- [x] 23 **A rep's "open quotations" does not sum to the two figures under it.** Verified; the caption names all three parts from the figure's own read (P11A-8, D95). `standing.ts:
  69-81, 136-149`, `day.ts:57-160`: the total counts requested too; the breakdown never does.
  Fix: a reason for a plain "requested" one, or a caption that says it. Reader cites code.
- [x] 24 **The queue's "longest wait" can name a request in neither list under it.** Verified; it is read from the rows the page shows (P11A-8, D95).
  `standing.ts:318-366` never filters archived companies; the lists do. Reader cites code.
- [x] 25 **`check-messages` guards five computed-key families and misses six more**, — verified; all eleven are read from their source lists (P11A-9, D96) — including
  `LINE_FIELDS` on the revision-diff screen. `scripts/check-messages.ts:186-192`. Two readers.
- [x] 26 **A rep who works a Saturday cannot write that day's report.** Verified; the box is offered on an open off day and says nothing is owed (P11A-10, D97). `workdays.ts:13-16`,
  `reports.ts:374-389`; S47 allows recorded Saturday work. Reader cites code.
- [x] 27 **The day's Log and WhatsApp controls are small and sit over a whole-card link.** Verified — 28px over a stretched link; each is 44 by 44 on a phone now, measured in `tests/thumb.spec.ts` (P11H, D130).
  `call-band.tsx:66-120`. A rushed thumb opens the drawer. Reader cites code. (11H.)
- [x] 28 **New Project and Edit Project never become bottom sheets.** Verified, and four more with them — mark lost, the log, confirm and prompt; all six are `ResponsiveDialog` (P11H, D129). They call the raw Dialog;
  nine others use `ResponsiveDialog`. Reader cites code. (11H.)
- [x] 29 **"Calls due" has no way to place a call.** Verified; every number is a message and a call, drawn once (P11A-11, D98). `phone.ts:61-63` exports WhatsApp only;
  `tel:` appears nowhere. Reader cites code.
- [x] 30 **Marketing's daily report shows six figures it can never move.** Verified; its card carries the two it can (P11A-10, D97). `reports.ts:256`,
  `report-figures.ts:32-49`; the coordinator got a trimmed set, marketing did not. Reader cites code.
- [x] 31 **The SMAC prompt hides the company while the number is retyped.** Verified; the four number prompts carry the customer's name under the title (P11A-11, D98). `prompt-dialog.tsx:
  94-101`: title and description carry a bare label. Reader cites code.
- [x] 32 **Stuck-request ageing reads holidays from the first of this month only.** Verified; both screens read back to the oldest request's day (P11A-10, D97). `team.ts:
  412-432, 516-532`, `calendar.ts:21-27`. Reader cites code.
- [x] 33 **The queue's headline counts are a capped array's length.** Verified; her waiting
  counts and her longest wait are asked of the list's own predicate, uncapped, and each list
  carries the tail the four list screens already had (P11J-7, D144). `queue/page.tsx:71-134`; `/dispatches` counts. Unreachable
  at fourteen people; wrong shape all the same. Reader cites code.
- [x] 34 **The board's "current card" ring is the alert red DESIGN already retired once.** Verified; the `bg-surface-2` wash the lists give their open row (P11G-2, D123).
  `board.tsx:98`, `globals.css:181`. Reader cites code. (11G.)
- [x] 35 **The phone breakpoint is written three times — 639, 640 and 768.** Verified, four with the log dialog's `max-sm:`; one constant, one hook, one lint rule, and the spec opens the same form at 767 and 768 (P11H, D128). `responsive-dialog.
  tsx:35`, `company-header.tsx:56`, `bottom-bar.tsx:34`; between 641 and 767 the shell is a
  phone and the dialogs are not. Two readers. (11H.)
- [x] 36 **The admin gate is hand-copied into seven pages, and both test sweeps miss `admin/use`.** Verified; one `requireAdmin`, and both sweeps read `ADMIN_PATHS` off the rail (P11A-12, D99).
  Derive the lists from `nav.ts`. Reader cites code.
- [x] 37 **A dispatch is never refused in the seed, the spec or the walk.** Verified; the seed carries one with its trail and the spec refuses one (P11A-12, D99). `demo-data.ts:
  885-929`, `tests/dispatches.spec.ts`; WORKFLOW §3 marks it done. Reader cites code.
- [x] 38 **Nor is a quotation ever rejected live, nor `quotations_decided_check` tested.** Verified; the spec rejects one through the screen and tries the check (P11A-12, D99). Same
  shape. Reader cites code.
- [x] 39 **A call card with no contact says nothing; the customer list says "no contact".** Verified; the card says the list's words (P11A-11, D98).
  `call-band.tsx` vs `companies-table.tsx:101-111`. Reader cites code.
- [x] 40 **A collapsed sidebar snaps open on every load.** Verified; a cookie the layout reads, so the first byte is the saved width and the `ready` frame is gone (P11G-3, D124). `use-sidebar.ts`: localStorage only,
  no cookie like theme and locale. Reader cites code. (11G.)
- [x] 41 **The browser chrome colour follows the OS, not Kladra's theme.** Verified; `generateViewport` reads the theme cookie and answers with the theme's canvas, named once with the manifest's (P11G-3, D124). `layout.tsx:46-54`.
  Reader cites code. (11G.)
- [x] 42 **`notifications.subject_type` is free text pretending to be a closed type.** Verified; a check that reads the one list (P11A-13, D100). `schema.
  ts:592, 611`. Fix: a pgEnum or CHECK. Reader cites code. (11C.)
- [x] 43 **`audit_log` has no index for the adoption query.** Verified; `audit_log_user_at_idx` (P11A-13, D100). `schema.ts:636-642`, `adoption.ts:
  78-95`: `(user_id, at)`. Reader cites code. (11C.)
- [x] 44 **Seven admin writes log an audit row whether or not a row changed.** Verified for five; each writes its row only when one came back (P11A-3, D87). Restore is finding 11; setting a target is an upsert, and clearing one that was never set is still what was asked for. `admin.ts:196-630`;
  `.returning()` and a count, as `archiveCompanyAction` does. Reader cites code.
- [x] 45 **The funnel calls a fresh "sent back" request "never asked again".** Verified; "not asked again yet", and the oldest's age beside it (P11A-14, D101). `chain.ts:34-121`.
  Fix: an age, said in the caption. Reader cites code.
- [x] 46 **The round-sum-round m² formula is retyped in six places.** Verified — six files and two specs; `src/lib/sqm.ts` and `one-figure` in the lint (P11A-2, D86). `dispatches.ts:571`,
  `months.ts:65`, `reports.ts:157`, `standing.ts:59`, `export.ts:193`, a test. One fragment. (11C.)
- [x] 47 **`check:messages` is not in the build or the stated pre-commit chain**, — verified; in `lint` and `prebuild` (P11A-16, D103) — though three
  files say a locale gap fails the build. `package.json:12`. Fix: chain it. Reader cites code.
- [x] 48 **"Revision" is نسخة on a dispatch error and مراجعة everywhere else.** Verified; مراجعة (P11A-15, D102). `messages/ar/
  dispatches.json:44`, `common.json:48`. Reader cites code.
- [x] 49 **The D68 name test passes when the person does not render at all.** Verified; it asserts for the reps by role (P11A-16, D103). `reading.spec.ts:
  401-408`. Reader cites code.
- [x] 50 **The "nothing can be written while viewing" test can skip its only write.** Verified; it asserts the control is absent (P11A-16, D103). `view-as.
  spec.ts:104-120`. Reader cites code.
- [x] 51 **The 44px touch rule lives in one file.** Verified — two, the bar and the bell by hand; it is the `touch` utility now, written once and carried by the kit (P11H, D130). `bottom-bar.tsx`, `button.tsx:29-41` tops
  out at 36. Reader cites code. (11H.)
- [x] 52 **The hand-over warning for marketing names what never moves and not what does.** Rewritten with D86: what moves, and that approved metres stay (P11A-2).
  `drawer.json:46`, `companies.ts:407-422`. Reader cites code.
- [x] 53 **The offline page is always dark.** Verified; the cookie is readable now and an inline script paints light before the first paint; the reader's claim that it already was readable was wrong — it was httpOnly (P11G-3, D125). `public/offline.html:20-33`; the theme cookie is
  readable without a server. Reader cites code. (11G.)
- [x] 54 **The coordinator's queue never highlights an arrived row.** Verified; the quotations and dispatches lists, and so the queue, mark arrivals (11B-1, D105). `use-arrived.ts` is wired
  into two tables, not hers. Reader cites code. (11B.)
- [x] 55 **`quotation_items` has no unique index on position; `dispatch_items` has.** Verified; `quotation_items_position_idx` (P11A-13, D100). `schema.
  ts:407-448` vs `505-509`. Unreachable through the app today. (11C.)
- [x] 56 **A target's month is normalised in Zod only, never in the database.** Verified; a check on both target tables (P11A-13, D100). `admin.ts:
  297-300`, `schema.ts:516-542`. (11C.)
- [x] 57 **Two revisions at once collide on the unique index and crash generically.** Verified; the parent row is held, so the second takes the next number (P11A-1, D85).
  `quotations.ts:629-651`. Fix: name the collision. Reader cites code.
- [x] 58 **`unused-messages` exempts all of `common.*` off one dynamic call**, — verified; a bare namespace reaches its families only, from the shared table (P11A-14, D101) — hiding a dead
  and wrong key. `unused-messages.mts:28-46`. Reader cites code.
- [x] 59 **"picked" in `errors.cityNotInCountry`; the glossary says never pick or select.** Verified; "chose", and the glossary pass in `check:messages` (P11A-15, D102).
  `errors.json:12`. Reader cites code.
- [x] 60 **"Person" is الموظف on the team screen and الشخص in admin.** Verified; one word, and a glossary row (P11A-15, D102). `team.json:14`,
  `admin.json:61`. Reader cites code.
- [x] 61 **`seed:volume` writes no audit trail**, — verified; the trail, the floor, the calendar and a self-check (P11A-17, D104) — so every trail panel is empty at the one scale
  meant to be walked. `seed-volume.ts`. Reader cites code.
- [x] 62 **`admin.spec.ts` re-implements Riyadh-today and the weekend.** Verified; imports `@/lib/dates` and `@/lib/workdays` (P11A-16, D103). `admin.spec.ts:37-58`.
  Import the real ones. Reader cites code.
- [x] 63 **Nothing automated covers the live channel.** `tests/live.spec.ts` — two people, no reload (11B-1, D105). No spec opens `/api/events`. (11B.)
- [x] 64 **The NOTIFY chunking branch has never run.** `tests/live-unit.spec.ts`, four hundred recipients (11B-1, D105). `live.ts:30-51`, 150 per payload against
  fourteen people. A unit test with a synthetic audience. (11B.)
- [x] 65 **The log dialog does not preselect the contact the card shows.** Verified; `contactId` from the card (P11A-14, D101). `log-dialog.tsx`,
  `call-band.tsx`: a `projectId` prop exists, no `contactId`. Reader cites code.
- [x] 66 **Eleven primary buttons fall back to a flat red instead of the brand gradient.** Verified for seven that remained; the `default` variant is deleted from `Button` and `Badge` and `variant` is required, so the fallback cannot come back (P11G-2, D123).
  `button.tsx:12`, `globals.css:169`: `default` aliases `--primary` to the brand hue. (11G.)
- [x] 67 **`archivedCount()` is dead code whose comment describes a badge that was never — deleted (P11A-14, D101) —
  built.** `admin.ts:275-282`. Reader cites code.

Merged: the quantity race (two readers), the SMAC pair, the six blind transitions, the
computed-key families, the breakpoint trio. Dropped: the un-capped waiting list, fixed in
P10d before this list was written (D83).
- [x] 68 **The dev server on 3100 hung with one core pinned and 3.5 GB resident, and stayed hung.**
  Seen once, P11A-3, while a screenshot pass signed Faisal in and opened `/en/companies` on the
  volume-seeded dev database: no request logged after the login, `curl` to any route got
  nothing, CPU time climbed without plateau for fifteen minutes. A fresh `next dev` served the
  same page in a second, and the production build in 300 ms — so it is the dev compiler, not
  the page, and it did not reproduce. Not a defect in Kladra's code as far as anything shows;
  kept here because a hang that eats a core until somebody notices is what 11I is for. If it
  is seen again: note what was compiled last (`.next/dev`), whether a second Next process was
  running from the same tree, and take a CPU profile before killing it. Observed, one reader.
  **Seen again, P11A-9, on the TEST server:** `next dev` on 3101, started by a spec run at 06:45,
  was still alive two hours and nine runs later at 2.9 GB resident — Playwright's stop reached
  the shell in front of it and not the server two processes down — and every run since had
  reused it (`reuseExistingServer`). The suite slowed from 13 to 16.6 minutes and the Arabic
  rep walk timed out at thirty seconds, on a step it passes in three. Killed; a fresh server
  ran the same walk green. Cause fixed in `scripts/dev-test.ts`: the server's whole tree goes
  when the script does, on a signal, on exit, or on finding its parent gone. The 3100 hang
  above is the same shape — a long-lived dev compiler that has hot-reloaded through hours of
  edits — so the rule for both is a dev server that has served one session's edits is restarted,
  not reused. **Seen twice more in one session, P11J**, and it cost two full gate runs: a
  `dev:test` server started by hand for a screenshot pass — outside the tree-kill the script does
  when IT owns the server — sat there through nine shot passes and reached 6.7 GB, and the
  machine killed a running acceptance suite twenty minutes in to get the memory back. Freed, it
  grew again over the next two hours and took the next suite down the same way. Closed here
  rather than left open, because four sightings say one thing and none of them is a defect in
  Kladra's code: `scripts/dev-test.ts` now caps the compiler's heap at 4 GB, which
  is six times a healthy run, so the next one dies at once and says why instead of starving
  whatever else is running; and the rule is in README where a person reads it (P11J-7).
- [x] 69 **`seed:volume` drew its SMAC numbers at random from four digits and collided with
  itself.** Seen P11A-12, restoring the dev database after the demo reseed: `between(1000, 9999)`
  for every issued quotation and approved dispatch, hundreds of each, so a duplicate under
  `quotations_smac_number_idx` was a matter of when, and the run died half-way with the database
  half-seeded. Cause: a random draw where a sequence belongs — the index is right, the draw was
  wrong. Fixed in P11A-12: counted up from 20000 and 30000, clear of the demo floor's.
- [x] 70 **A typed reason on the quotation and dispatch sheets ran in the page's direction, not
  the writer's.** Found by the test-runner in P11A-12: the "Sent back because" / "Rejected
  because" / "Refused because" box on each sheet was a bare `<p>`, while the same sentence two
  lines down in the trail went through `Prose` (`dir="auto"`) — one sentence read two ways on
  one sheet, against rules/words.md. Cause: a second way to lay out typed text, written by hand.
  Fixed in P11A-12: both boxes are `Prose`, and `one-look` now refuses a hand-laid typed block
  (`whitespace-pre-*` outside `prose.tsx`).

- [x] 71 **One screen asks the database forty-eight questions, and every screen reads the session
  row seven times over.** Verified by the harness and halved where it was repetition: the session user and the calendar are once-per-request reads (P11I-1, D131); the rest of a screen's count is one statement per figure, each under 4 ms, and stays. `npm run measure:reads` keeps the baseline. Measured in 11C-2 (D107): the manager's day is 48 statements — seven of
  them the session, six the non-working-days calendar, one per band — the rep's day 32, and each
  statement is under 4 ms, so what a screen costs is round trips, not work. For 11I: read the
  session once per request and let a screen's bands share one calendar; then re-measure against
  the §3 baseline.

The whole flow walked (P11D). One reader this time — the session, with the authority files
already in hand — walking every dialog, drawer, band and notice in the code for four things:
what is retyped, how many presses, what a person must carry in their head, and where two
screens can answer one question two ways. Each entry was read in the code before it was written
down, and the counts are in §3 "The flow, counted". Ranked as above: what lies or loses first,
then what costs presses.

- [x] 72 **A follow-up count counts dates, and the list it opens shows something else.**
  Verified and fixed in P11D-1 (D108): the counts are the lists' own filters, companies on
  Companies, the day and the team table, projects on Projects; `tests/counts.spec.ts`.
  `followUpCounts` (`src/lib/followups.ts:219-247`) counts the rows of a `union all` of company
  dates and project dates. The pill on Companies opens `?filter=overdue`, which is one row per
  company by `least(company, min(project))` (`src/lib/companies.ts:177,250`;
  `followups.ts:86`); the chip on Projects opens a list of projects only
  (`src/lib/projects.ts:143`); the day's bands are `listCompanies` rows under `total:
  totals.overdue` (`src/components/day/call-list.tsx:62-63`), so "and 2 more" can name
  companies that are not there; the team table's "Overdue follow-ups" is the same count
  (`src/lib/team.ts:183`) and opens the rep's companies (`team-table.tsx:57`). Measured on the
  volume floor: Faisal's Projects screen says 37 overdue and the list under the chip holds one
  project. Cause: one count for three units, written once "because the strip counts both" (D9)
  — and D9 itself says "clicking it lists them", which is D95's rule. Fix: a count counts the
  rows the list it opens will show — companies by their effective date on Companies, the day and
  the team table; projects on Projects — through the same predicate the list filters by.
- [x] 73 **A company that comes back from the archive is not recognised.** Verified and fixed
  in P11D-2 (D109): archived rows match, the warning says when and why, a live one says where
  and when last worked; `tests/known.spec.ts`. The duplicate check
  reads live companies only (`src/lib/companies.ts:532`, `isNull(companies.archivedAt)`), so a
  customer archived last year with "closed down" is created again as a stranger, and the reason
  somebody gave up on him — the whole point of archiving rather than deleting (S16) — is never
  shown to the rep typing him in. The warning that does fire names the company and the rep and
  nothing a rep can decide by (`add-company-dialog.tsx:173-182`). Cause: the archive was built as
  a place things go, not as a place the app looks. Fix: the check reads archived companies too
  and the warning says what it knows — the city, the last activity, and for an archived one who
  archived it, when, and why; creation stays unblocked (S15).
- [x] 74 **A notice names a number and never the customer.** Verified and fixed in P11D-3
  (D110): the customer is in every quotation and dispatch sentence, joined at read time from
  the subject; the chain specs look for the sentence with the customer in it. Every quotation and dispatch
  notice carries `label` and nothing about the company (`src/actions/quotations.ts:302, 390,
  468, 644, 730, 827, 904`; `src/actions/dispatches.ts:354, 549, 725`), and both message files
  say "{label} came back for edits" / «أُعيد عرض السعر {label} للتعديل». A rep with eight open
  quotations and the coordinator with thirty must remember which customer Q-12 is before the
  sentence means anything. The list already resolves the rep's name at read time from an id
  (`src/lib/notifications.ts:83`, D68) and every notice carries its subject (D79). Cause: the
  sentence was written from what the action had in hand, not from what the reader needs. Fix:
  the customer's name, resolved at read time from the subject the way the rep's is, in the
  sentence in both locales.
- [x] 75 **A call card says who to call and not why.** Verified and fixed in P11D-4 (D111):
  the last entry's words ride with the card, one line, in the writer's direction;
  `tests/why.spec.ts`. The day's call band shows the company,
  the main contact, the city, the date, Log and the number (`src/components/day/call-band.tsx:
  55-120`); no list anywhere carries the words of the last entry — `listCompanies` and the
  standing strips return `lastActivityOn` and nothing else (`src/lib/companies.ts:188`,
  `standing.ts:29,220`). The rep who wrote "wants 4 mm samples, follow up tomorrow" reads
  tomorrow's card as a name and a date, and either remembers or opens the drawer for the
  Activity tab. Cause: the card was built from the follow-up table's columns, and the reason
  lives in another table. Fix: a card that asks for a call carries the last entry's first line
  and its day, from the same query that already finds the last activity's date.
- [x] 76 **The dispatch sheet says quoted and sending, never what already went.** Verified and
  fixed in P11D-5 (D112): each line reads sending · on the quotation · on other dispatches ·
  left to send, from `committedQtySql`'s definition; Rawan's reading step in
  `tests/dispatches.spec.ts` holds the two new figures to the line's own arithmetic. A dispatch's
  lines carry `qty` and `quotedQty` only (`src/lib/dispatches.ts:364,407`); the quotation sheet
  shows one total "left to send" and per-line quantities as quoted (`quotations.ts:430`). Rawan
  approving the third partial dispatch reads "sending 40 of 100 quoted" and has to open the
  quotation and count the mini list to know that 70 already went. Nothing corrupts — the action
  holds the row and refuses an over-send (D85) — but she approves blind or clicks through. Cause:
  the committed-quantity SQL exists for the rep's dialog (`dispatches.ts:156,556`) and was not
  offered to the reader who checks the request. Fix: each line on the dispatch sheet reads
  sending · already sent · quoted, from that one definition.
- [x] 77 **Two weeks of leave is fourteen dialogs.** Verified and fixed in P11D-6 (D113): a first
  day and a last day, one row per day, a day already there skipped; `tests/presses.spec.ts`. The calendar takes one day per submit
  (`src/components/admin/holidays-panel.tsx:173-215`, one `DatePicker`, hidden `day`;
  `src/actions/admin.ts:545+`, `day: regex`), six presses each with the person picked every
  time. Eid is four or five days twice a year and S48's own example is "a rep back from two
  weeks off" — eighty-four presses, or, likelier, leave that never gets entered and a pace that
  says he is behind. Cause: the row is a day, and the form was drawn from the row. Fix: the
  dialog takes a first and a last day and the action writes one row per day in the span; the
  table, pace and leave stay exactly as they are.
- [x] 78 **Enter does nothing in the coordinator's number box, a target box, or a new project.**
  Verified and fixed in P11D-7 (D114): all five are forms; Rawan issues with Enter in
  `tests/presses.spec.ts`.
  `PromptDialog` has no form (`src/components/ui-ext/prompt-dialog.tsx:105-166`): Rawan types
  SMAC's number and must find Issue or Approve with the mouse, on her most frequent act; the
  target box saves from a button (`targets-panel.tsx:148`); New project, Edit project and Mark
  lost submit from `onClick` (`new-project-dialog.tsx:186`, `edit-project-dialog.tsx:142`).
  Every other dialog is a `<form>` and Enter saves it. Cause: three dialogs were written before
  the form shell and never moved onto it. Fix: a dialog with a text field is a form and Enter
  submits it; a multi-line reason keeps Enter as a new line and takes Ctrl/Cmd+Enter.
- [x] 79 **A month's targets are five boxes, five Saves, and no memory of last month.** Verified
  and fixed in P11D-8 (D115): last month's figure under an empty box and one press to keep it,
  Enter saves; the boxes stay one Save each on purpose (the panel's own reason stands);
  `tests/presses.spec.ts`. Each
  person's target is its own box with its own Save (`targets-panel.tsx:85-150`), and a new month
  opens every box empty (`value === null → ""`) with nothing on screen saying what last month
  was. Cause: the box was built for one correction, and the monthly chore is five of them. Fix:
  last month's figure under each box and one press to keep it, and one Save for the month.
- [x] 80 **Logging on a company with one contact still asks which contact.** Verified and fixed
  in P11D-8 (D115): one contact is the contact; several still open on nobody;
  `tests/presses.spec.ts`. The log opens on
  "No contact" unless the button that opened it named one (`log-dialog.tsx:232`, the call card's
  D101); from a drawer, a company with exactly one person opens on nobody, so naming him is two
  presses on every entry or the entry goes unnamed (S24). Cause: the default was written for the
  many-contacts case. Fix: when a company has one contact, the log opens on him; with several it
  still opens on nobody, because guessing would misname the call.
- [x] 81 **A queue row does not say whose request it is.** Verified and fixed in P11D-8 (D116):
  the queue's rows and cards name the rep in the reader's script, a rep's own list does not;
  `tests/presses.spec.ts`. The coordinator's rows carry the
  quotation, the company, the project, the metres, the total and the wait (`quotations-table.tsx:
  316-323, 349-362`); the rep who raised it is in the sheet only (`:560`). The conversation
  about a request is with the rep (S54), so she opens each row to learn whom to write to.
  Cause: the row was drawn for the rep's own list, where the rep is himself. Fix: on the queue,
  the row names the person, in the reader's script (D68).
- [x] 82 **A typed line on a wide card floats to the far edge.** Seen in the box's own shots
  and fixed in P11D-9: on Faisal's English day at 1366 the Arabic last-said line under a
  company sat alone at the right edge of the card, nearer the date than the name, and the
  sent-back reason on a waiting card had done the same since P11A-11 (parked then as a layout
  note). Cause: `<Prose>` served two layouts with one rule — `dir="auto"` on the block gives a
  paragraph its own alignment, which is right for a report or a log entry and wrong for a
  one-line caption that belongs to the row above it. Fix: `<Prose line>` keeps the page's
  alignment for the block and the writer's direction for the words in a `<bdi>`; the call
  card, the waiting card, the notice, the history row, the archive row and the duplicate
  warning use it; the rule is written beside the paragraph rule in DESIGN §5 and words.md;
  `tests/why.spec.ts` reads both directions. In the same pass the targets row put its unit and
  Save on the box's own line, so a row with last month's figure and one without wrap alike.

Refuted in the walk, so the next reader does not re-find them: the quotation line is nine
fields but only colour, three lookups and the price are typed on a first line, and the second
line and the next quotation start from the last (D74, 9A item 7); the second dispatch already
opens on the first one's site and terms (D81); the log is three presses with the company,
the contact, today and the channel filled (D82, D101); the phone number is the search key and
Ctrl+K reaches it from anywhere (SPEC §3); every write refreshes every open screen of everyone
it concerns, so the same figure on two screens is one query and one live event (D105); the
team table, the rep's strip and the day read target, achieved and pace through one function
(`repMonth`), and pipeline and open quotations through one (`personStanding`), so there was no
second definition to find (D95, D102); and the manager's "stuck" is on his home screen at zero
presses. Parked for other boxes: the date picker offers no "tomorrow" or "next week" (11H, the
phone); the duplicate warning cannot open the company it names because the form would be lost
(11F, views).

The dashboards and reports audited as products (P11E). The session again, reading the five
screens a person opens to know how things stand — the team screen, the rep's day, the daily
report, the coordinator's queue, the admin's Use screen — in the code and then in shots at
volume on the production build, for four things: one look, no interpretation, every figure
saying what it means, and a chart only where a shape is clearer than a number. Ranked as above.

- [x] 83 **The desk team table's pace cell drops its unit.** Verified and fixed in P11E-1
  (D117): `team-table.tsx` printed `4 / 22` on the desk while the phone card and the month card
  said "4 of 22 working days" — and the phone card's own comment claimed the desk already said
  the words. Cause: the phone card was fixed in P9.4 against a reference nobody re-read. Fix:
  the desk cell says `team.paceLine`; `tests/manager.spec.ts` reads it.
- [x] 84 **The team table's habit counts go nowhere.** Verified and fixed in P11E-1 (D117):
  open quotations, overdue follow-ups and never-contacted were bare numbers; the row's one link
  was the name, to the whole floor. Cause: the table predates `?rep=&filter=`. Fix: overdue and
  never open the floor under that filter, open quotations opens the floor whose strip carries
  the figure and its parts, zero stays plain; the phone card's link moved onto the name so the
  counts could be doors. `tests/counts.spec.ts` step 4 presses one and counts the rows.
- [x] 85 **The day's waiting list ranks a customer's silence above a coordinator's send-back.**
  Verified and fixed in P11E-2 (D118): `waitingOnRep` merged three kinds and sorted by age, so
  on the volume floor Faisal's 83 (20 sent back, 24 refused, 39 with the customer) opened on a
  month-old customer-held quotation and the calls began 2,987px down; the heading said 83 over
  25 cards and the tail said "and 58 more" with nowhere to go, by its own comment. Fix: kind
  first then age; the heading's three pills are doors to `/quotations?status=returned`,
  `/dispatches?status=refused`, `/quotations?status=issued`; `tests/stopped.spec.ts`.
- [x] 86 **The queue does not say a quotation was revised under a waiting dispatch.** Verified
  and fixed in P11E-3 (D119), §5 #2's leftover: `selection()` carried the revision and no
  "superseded" flag; approval refused it (D85) and the queue said nothing. Fix: a `superseded`
  column from the same `exists (later revision)` test `isLiveRevision` runs, a line on the row
  and the card, the sentence on the sheet, Approve disabled; `tests/revised.spec.ts`.
- [x] 87 **The chain card's sentences at one.** Verified and fixed in P11E-4 (D120):
  `team.chainMeans` "Of the 1 raised … each one", `team.chainAnswered` "1 of them reached a
  customer, and 0 came back" — no plural forms in English, none in the Arabic of the second
  (reviewer, P11A-8, P11A-15). Fix: ICU on each half, both locales.
- [x] 88 **The Use screen's words and its window disagree.** Verified and fixed in P11E-4
  (D120): "Changed this week" over the trailing `USE_WINDOW_DAYS` (`adoption.ts`); "nothing
  opened for {days} days" with no English plural (reviewer, P11A-6). Fix: both take `{days}`
  from the constant, plurals in both locales.
- [x] 89 **The report's biggest figure has the vaguest name.** Verified and fixed in P11E-4
  (D120): `reports.moved` "Moved" over the m² of dispatches approved on the floor that day
  (`reports.ts`, S43). Fix: the board's heading is "m² approved" / «المساحة المعتمدة» and
  the moved line's label carries the unit over a bare figure («م² معتمدة») — the first cut
  printed "280.49 m² m² approved", seen in the after-shots.
- [x] 90 **Fifteen numbers where five bars would do.** Refuted on the shots: a bar per rep
  under the team table lines five people up for comparison, which is the ranking S46 forbids in
  spirit; the achieved figure already wears the pace colour, and the company's one bar answers
  the question the manager asks first. Not built.
- [x] 91 **The pipeline figure carries ".00" on a screen of whole metres.** Seen in the shots,
  fixed in P11E-1 (D117): `Sqm` printed two decimals everywhere; the team strip read
  "1,280,171.00 m²" beside a table of whole figures. Fix: `<Sqm whole>` for a sum of
  estimates on the team strip, the person strip and the company header; measured m² unchanged.
- [x] 92 **The report's moved line says "1 Companies".** Seen in the shots, fixed in P11E-4
  (D120): the moved line borrowed the board's headings as nouns after a number. Fix: a
  `<key>Label` plural per count figure in both locales (registered as a message family), the
  headings unchanged, the m² figure keeps its name.

Refuted in the walk, so the next reader does not re-find them: the six-month sentence at 0%
already says "matched" (`monthSentenceKey`, `team.monthSame`) — the P11A-11 note was stale;
the queue strip counts the rows on the page on purpose (page comment, D95: a second query once
named a request neither list showed), the cap is 200 and a desk with two hundred waiting
requests has a bigger problem than a count — noted, not changed; the manager's strip and the
table's two "overdue" figures carry their thresholds in words (D95); the current month's bar is
grey and unjudged by design (D61); the report cards share keys across desk and floor; the Use
screen's amber is one predicate (`isQuiet`); the rep's day order — month, stopped work, calls —
is argued in the page and stands, and 11H reads its length on the phone.

A view per screen, chosen not copied (P11F). Every screen read against its own question in
the code and in the 11D-11E shots at volume, and the answer written where the views argument
already lived: DESIGN §6 now carries the table of screens, questions and views, and the table
of every move the board could offer with what its drop would need. The second table is the
drag rule closed on evidence: nine transitions, seven needing typed data, two needing a
confirmation, which is a dialog with a longer gesture in front of it — nothing qualifies, and
at 375 there is no drag at all. One fix came out of the walk.

- [x] 93 **The duplicate warning cannot open the company it names.** Parked from the 11D walk
  and fixed in P11F-2 (D121): the warning said "looks like an existing company: X (rep)" and
  the only way to look at X was to close the form and lose it. Cause: the form and the drawer
  are two overlays on one screen and nothing had ever opened one over the other. Fix: "Open
  {name}" in the warning opens the company's drawer over the form (`?open=`, `scroll={false}`);
  the form keeps its state, Escape closes the top layer only. The first cut drew the door for
  every match and the spec found the drawer empty: another rep's company is not his to read
  (S8, `mayOpen`), so the hit now says whether it is his and the door is drawn only then;
  `tests/known.spec.ts`.

Refuted in the walk, so the next reader does not re-find them: the phone's card-per-row is the
same view on a narrower page, not a second one (D59); the queue has one state and therefore no
board; the projects screen has no states to make columns of; the admin panels are opened too
rarely to earn a choice; the day and the team screen are one column on purpose (DESIGN §6,
"a dashboard answers one question").

Identity, motion and feel as one thing (P11G). Two inventories were taken first — every empty
state on every screen, and every place a press waits for the server — and then the six parked
findings and what the inventories added were fixed together, so that the error card, the
pending mark, the wash on a current card and the flash on an arrived row are one hand's work.
Every slice ended in the browser: the new error boundary was seen for the first time in the
suite, drawn by a defect nobody knew about (#99).

- [x] 94 **A pressed row said nothing until the drawer answered.** Fixed in P11G-4 (D126).
  Rows, chips, the view switch, board cards and the follow-up pills are Links to a search
  parameter; between the click and the streamed answer nothing on the page changed. Cause: no
  Link in the app read its own status. Fix: `LinkPending` (`useLinkStatus`) inside each,
  invisible for 150 ms; `tests/feel.spec.ts` holds the answer back and watches the mark.
- [x] 95 **A picker's search miss said the list was empty.** Fixed in P11G-5 (D127). Three
  request dialogs passed "no projects / quotations / companies yet" as `SearchableSelect`'s only
  empty sentence, and it was shown for a typo. Cause: one slot for two states. Fix: the caller's
  sentence only when `options` is empty; `forms.noMatch` for a miss; `tests/states.spec.ts`.
- [x] 96 **An empty board was six columns of "Nothing here."** Fixed in P11G-5 (D127). The
  board rendered whenever the view said so, past the empty branch. Fix: no rows, no board — the
  list's sentence with its Clear; `tests/states.spec.ts`.
- [x] 97 **The queue called the desk clear under a search that missed, and offered an "All"
  that led nowhere.** Fixed in P11G-5 (D127). `waiting` counted the filtered rows, so a miss
  read as a clear desk with two empty tables under it; the tables' status branch offered a link
  to `/queue`, which fixes the status itself. Fix: the clear-desk sentence needs no search term
  and replaces the tables; `fixed` on the empty branch drops the door; `tests/states.spec.ts`.
- [x] 98 **A manager's `?rep=` was dropped by a search, a row and the way back.** Fixed in
  P11G-5 (D127). Four URL builders on the companies screen, none carrying `rep`. Fix: the page
  hands `repId` to the strip, the search, the table and the empty panel; `tests/states.spec.ts`.
- [x] 99 **Any search term without a digit took the quotations, dispatches and queue lists
  down.** Found by the new board test, which met the new error page instead of a sentence.
  Fixed in P11G-6. Cause: `(${digits} <> '' and number = ${digits}::int)` — Postgres casts
  before it guards, and `''::int` fails. Fix: `numberInTerm` decides in TypeScript, the first
  run of digits (so "Q-12/3" asks for 12, not 123), bound only when it is an int; the rule is
  in rules/data.md and DESIGN §5; `tests/states.spec.ts` searches all three for a word.
- [x] 100 **The lookups list said nothing when a kind had no rows.** Fixed in P11G-5 (D127). An
  unguarded `.map` — an empty column that reads as a screen that failed to load. Fix: one
  sentence, `admin.emptyLookups`. Unreachable through the app today (rows are hidden, never
  deleted), so no walk; the sentence is in both locales.
- [x] 101 **The sign-out could be pressed twice.** Fixed in P11G-4 (D126). A plain form submit
  with no pending state. Fix: `useFormStatus` on the item.
- [x] 102 **Dialogs zoomed in 100 ms, outside the band DESIGN names.** Fixed in P11G-2 (D123).
  shadcn's default, never revisited. Fix: 150 ms for dialogs, 200 ms for the drawer's overlay
  to match its slide; menus keep 100 ms and the principle now says why; `tests/motion.spec.ts`.
- [x] 103 **The board's hover wash was the current wash.** Found by the guidelines pass, fixed in
  P11G-7. `hover:bg-surface-2` on every card made the card under the pointer look like the
  open one. Fix: the hover is the lift `card-face` already has; the wash means open.
- [x] 104 **The pending mark said nothing to a screen reader.** Found by the guidelines pass,
  fixed in P11G-7 (D126). `aria-hidden` on the glyph and nothing else in the link changed. Fix:
  a polite live region that is always in the link and says "Loading…" only while the answer is
  out — present before it speaks, because a region added and filled in one breath is not read.
- [x] 105 **The account menu was named "Your account" and nobody's.** Found by the guidelines
  pass, fixed in P11G-7. The `aria-label` replaced the visible name, which is hidden below
  `md` anyway. Fix: `shell.accountMenuFor`, "Your account, {name}", both locales.
- [x] 106 **The rail's cookie could throw inside a render, and another tab's toggle was lost.**
  Found by the critic, fixed in P11G-8. The first cut read `document.cookie` unguarded in the
  store's snapshot — a refusal there is a render error, and the new boundary would have replaced
  the whole shell with the error card; and the `storage` event that used to carry a second tab's
  toggle has no cookie equivalent. Fix: both touches guarded, expanded as the fallback; the cookie
  is read again when the tab comes back into focus.
- [x] 107 **A quotation number typed on an Arabic keyboard was never found.** Found by the critic,
  fixed in P11G-8. `numberInTerm` matched Western digits only, so ٤٥ asked for nothing — the
  same defect as #99 in a quieter voice. Fix: Arabic-Indic and Extended Arabic-Indic digits are
  read as 0–9 before the match; the pure test in `tests/states.spec.ts` types both.

Refuted, so the next reader does not re-find them: the report screen's empty "others" list is
an empty `<ul>` under a heading that already says the count, invisible and honest; the users and
use panels cannot be empty while the admin reading them is a user; `QuotationHistory` returns
null on zero events, which raising a quotation makes unreachable; the sign-in group has no
`loading.tsx` because there is nothing to load; a missing screen under a streamed shell answers
200, because the status line has gone out before the page says so — what a person gets is the
card, and the spec reads the card; rendering the error card inside the Playwright runner is not
possible (it compiles imported JSX for its own component tests), so the failed face is covered by
the shared component and `check:messages`; the pressed-row spec cannot be pre-empted by a
prefetch, because the suite runs on `next dev`, where a Link prefetches nothing; and the
archive dialog's `router.push("/companies")` does drop `?rep=`, but only the company's own rep
sees that button, and his URL never carries one.

The phone, one-handed (P11H). The four parked findings first (#27, #28, #35, #51), then the
four flows walked at 375 in a spec and looked at in both locales and themes, then the reviews.
What the walk found on top:

- [x] 108 **The Add project sheet named no company.** Found walking the drawer at 375, fixed in
  P11H. `newProjectIn` ("Add project at {company}") existed and nobody passed the name, so the
  sheet — which on a phone covers the drawer entirely — said "Add project" over a blank. Fix:
  both call sites in the drawer pass `company.name`; the spec opens it by that title.
- [x] 109 **vaul slides a sheet in 500 ms, twice DESIGN's band.** Found by the motion spec's
  sibling, fixed in P11H (D129). Moving six forms onto vaul would have put every form on a
  phone outside the band 11G had just measured. Fix: globals.css holds `[data-vaul-drawer]` and
  its overlay to 250 ms with `!important`, because the library injects its own stylesheet and
  writes the drag-release transition inline; `tests/motion.spec.ts` measures the sheet.
- [x] 110 **A dirty log sheet could be swiped away.** Introduced by the move and closed in the
  same slice (D129). The dialog's `onInteractOutside` guard (D84) did not survive the move:
  vaul reads `onPointerDownOutside` first and stops only when it is already prevented, and a
  drag down is a gesture Radix never had. Fix: `guardOutside` on `ResponsiveDialog` — no drag
  (`handleOnly` with no handle) and no outside tap while dirty; Escape and Cancel still close.
  The critic then found the other five sheets open to the same swipe (#118).
- [x] 111 **The bell wrote the 44px rule by hand.** `size-11 md:size-8` on one button, the same
  rule the bar wrote its own way (#51). Fix: the class goes; `Button` carries `touch`.
- [x] 112 **A confirmation's Enter did nothing, and its buttons were not a form.** Found
  converting `ConfirmDialog`, fixed in P11H. The confirm button was `type="button"` with an
  `onClick`, so Enter in the question under it (the hand-over picker, an archive reason) did
  not confirm (D114 says it should). Fix: a form, whose submit stops at itself — React carries
  a submit through a portal to the form above it, and three admin panels open these from
  inside one.
- [x] 113 **The prompt's "whose record" line was read by nobody.** Found by the guidelines
  review, fixed in P11H. The customer's name sat in a paragraph between the title and the
  description; Radix wires only those two to the dialog, so a screen reader heard "Issue Q-12"
  and the sentence and never the company — the whole point of D98. Fix: the name is the first
  line of the description, in both faces of `ResponsiveDialog`.
- [x] 114 **The sheet's 250 ms outranked "less motion".** Found by the guidelines review, fixed
  in P11H. The vaul override is an attribute selector, which beats the reduced-motion block's
  `*` whatever the source order, both being `!important`; a person who asked for less motion
  still got the slide. Fix: the sheet is named inside the reduced-motion block too, and
  `tests/motion.spec.ts` opens one at 375 with motion reduced.
- [x] 115 **A held sheet still showed the handle that invites a swipe.** Found by the guidelines
  review, fixed in P11H. With words typed the sheet does not drag (#110) and the pill at its
  top said it would. Fix: the content carries `data-drag="off"` while held and the kit hides
  the pill.
- [x] 116 **The log's channel chips were the one control in the sheet under 44.** Found by the
  guidelines review, fixed in P11H (D130). Native radios inside a label, and the label is not a
  kit control, so `touch` never reached it. Fix: `touch` on the label.
- [x] 117 **Four forms' submit did not stop at itself, and the SMAC box could be autocorrected.**
  Found by the guidelines review, fixed in P11H. `stopPropagation` on the log, project and
  mark-lost forms as on confirm and prompt (#112); `spellCheck` off on the number box.

- [x] 118 **Five sheets could still be swiped away with words in them.** Found by the critic,
  fixed in P11H (D129). #110 held the log by its own `dirty`; New and Edit project, Mark lost,
  Prompt and Confirm — and the nine forms that were sheets before this box — passed nothing, so
  a half-typed project was one downward swipe from gone. Fix: `ResponsiveDialog` hears `input`
  under it and holds itself once anything is typed, on every form; `guardOutside` stays for what
  inputs do not say.
- [x] 119 **`(max-width: 767px)` is not `max-md:`.** Found by the critic, fixed in P11H (D128).
  Tailwind compiles `max-md:` to `(width < 48rem)`; at a fractional width — zoom, an odd pixel
  ratio — 767.5 was a phone to the stylesheet and a desktop to the hook, the very defect D128
  closed, and the spec at 767 and 768 could not see it. Fix: `PHONE_QUERY` is `(width < 48rem)`;
  `PHONE_MAX_PX` stays for the spec's viewport.
- [x] 120 **The tab a thumb presses was 37px inside a 44px list.** Found by the critic, fixed in
  P11H (D130). `touch` sat on the list; the trigger is `calc(100% - 1px)` of a padded list. Fix:
  `touch` on the trigger, and the list lets go of its height on a phone.
- [x] 121 **Three search boxes' clear grew over the text.** Found by the critic, fixed in P11H.
  The projects, quotations and dispatches searches each draw their own clear button — a
  `Button`, so 44 wide now — inside an input that reserved 40px; the tail of a long term sat
  under the X. Fix: `max-md:pe-12` on the three. Four hand-drawn search boxes is the cause and
  was fixed in P11J-2 (#143); the picker race is still parked.
- [x] 122 **The sheet's stated height was fiction.** Found by the critic, fixed in P11H. The kit's
  `max-h-[80vh]` is an attribute selector and the sheet's `max-h-[92dvh]` never applied. Fix:
  `max-h-[88dvh]!`, the company drawer's figure, in dvh.
- [x] 123 **Six dialogs grew four rem on the desktop and nobody wrote it down.** Found by the
  critic, recorded in P11H (D129). The one responsive dialog is `sm:max-w-lg`; the six it took
  over were `sm:max-w-md`. One width for every form is the point of one dialog; the change is
  recorded rather than reversed.
- [x] 124 **`one-look` had a hole the width of a file, and failed a block comment.** Found by the
  critic, fixed in P11H. The whole of globals.css was exempt from the phone-line rule, so a
  second hand-written query there passed; `max-[767px]:` and a range query were not matched; a
  line opening with `/*` counted as a breach. Fix: `path#text` allowances that exempt only the
  lines carrying the text (the 980px blur line), the pattern widened, `/*` skipped.
- [x] 125 **A comment lied about a field.** Found by the critic, fixed in P11H. `spellCheck`
  off on the prompt's single-line box was explained as "a number", and the same box takes the
  admin's new password. The behaviour was right; the comment says both now.

- [x] 127 **A press on Add company opened nothing, one time in thirty, at a phone width.** Seen
  in the 11G gate (forms at 375, quotations), in the 11H gate (`reading.spec.ts:85`, Arabic, 375)
  and once in 32 repeats of those two tests; fixed in P11H (D129). Cause: the trigger was a
  Radix `DialogTrigger` inside the Dialog branch and a `DrawerTrigger` inside the Drawer branch,
  and `useIsPhone` swaps the branch on the first render after hydration — the fixture waits for
  `html[data-hydrated]`, which is the root's effect, and the swap commits a beat later, so the
  button Playwright (or a thumb) had resolved was unmounted between press and release. Fix: the
  opener stands outside the swap, a `Slot` that sets `open`, with `aria-haspopup` and
  `aria-expanded`; the faces hand focus back to it on close (Radix only hands it to its own
  trigger). Thirty-two repeats after: none failed. Was parked for 11I as "the picker race"; the
  picker was innocent. The first cut of this fix handed the trigger to a raw `Slot` and skipped
  the kit's `useSlotChild`: a button built in a server component crosses as a lazy wrapper, and
  the Arabic company drawer went to the error card twice in the next gate; the opener resolves
  its child first, as every trigger in the kit does.
- [x] 126 **Six Arabic strings, and one imperative the lint did not list.** Found by the Arabic
  reviewer on the 375 shots, fixed in P11H. «الأمتار» is linear metres where the field says
  م²; "the number **on** Q-7" was an English calque twice («على {label}» → «لعرض السعر {label}»
  and «للتوريد {label}»); «تُبلَّغ لصاحب» took the wrong preposition; the log's subtitle called
  the entry «إدخال» where every other screen says «تسجيل»; and «فاتركه» — "leave it", to a man —
  had shipped in the admin's last-day hint because the lint matches whole words and the
  imperative wore a prefix and a suffix. Fix: the strings, and `gendered-arabic.mts` lists
  «اترك» with its attached forms.

Seen on the 375 shots and left, with the reason: «أبريل 2026» is the one month label on two
lines, which is D65's rule (the year only where it changes) and not a fault; the focused textarea's
ring peeks over the top of the scrolling body, which is the ring doing its job at an edge. The
third one on that list — the quotations list's status chips wrapping round the list/board switch,
so «الكل» landed on a second row that read as another group — was the search-box question's
neighbour and was parked for box J. It is fixed there (§5 #153, D145).

Refuted or confirmed by the critic, so the next reader does not re-find them: `@variant max-md`
inside `@utility touch` compiles on Tailwind 4.3 to `@media (width < 48rem)`; the calendar's day
cells use `buttonVariants` and stay small; the bell's hand-written `size-11 md:size-8` is exactly
`size-8` plus `touch`; vaul's `handleOnly` with no handle is "no drag", `dismissible` stays true
so Escape and the overlay work, and `onPointerDownOutside` prevented does stop it closing; the
250 ms `!important` beats vaul's inline transition and not its `transition: none` during a drag;
`useIsPhone` reads a server snapshot, so nothing mismatches on hydration, and every form holds
its state above the Dialog↔Drawer swap, so a rotation mid-form loses nothing.

Left on purpose, so the next reader does not re-find it: `transition-all` on the kit's button
animates colour, a shadow and a one-pixel translate and nothing that lays out, which is what
the guideline's warning is about; it stays. And one throw the suite now ignores: React's
development build measures a redirected or missing page with a timestamp Chromium refuses
("cannot have a negative time stamp"), and nine specs failed on it in one warm run without a
line of the app in the trace; the fixture names that one message and no other, and a
production build never emits it (`tests/helpers/i18n.ts`).

Speed and reliability, measured (P11I). Two harnesses first — what every screen asks the
database (`npm run measure:reads`) and what a mid phone pays to draw the main screens
(`npm run measure:speed`) — both against the production build, both keeping a baseline file
the next change is held to; then the reads halved where they were repetition, and the unhappy
paths walked with the wire cut.

- [x] 128 **Every screen read the signed-in user twice and the calendar once per band.** Measured
  by the harness (459 statements over 43 screens on the volume floor), fixed in P11I-1 (D131).
  `getRealUser`, `getUser` and `listNonWorkingDays` are React `cache` functions now: 400
  statements over the same 43 screens, every screen at least one fewer, the team screen two.
  What remains is one statement per figure, each under 4 ms.
- [x] 129 **A write with no signal became the error card, with the words inside it.** Found reading
  the submit paths for the unhappy walk, fixed in P11I-3 (D132). Every client call of a server
  action — the submit helper, the four forms and the sign-in on `useActionState`, fourteen
  `startTransition` sites — awaited it bare; a rejected call, not a refused one, went to the
  boundary. The first fix caught it in four places and the company form still became the error
  card, because a form's action rejects the same way; the cause is one guard, `useWireGuard`,
  twenty-three calls go through it, and a lint rule refuses a bare one. `tests/unhappy.spec.ts`
  cuts the wire under a log, the company form and the archive question.
- [x] 130 **Nobody knew what a rep's phone paid to draw a screen.** The 11C measurement was of
  the database alone; the phone was a feeling. P11I-4 built `npm run measure:speed` (D133) and
  measured: a cold screen is live in 2.9–3.5 s on a slow 4G with the CPU held four times slower,
  for 467–582 kB, of which 237–308 kB is script and about 160 kB fonts and styles. The first two
  cuts of the script lied — "cold" had the sign-in page's chunks in the cache (65 kB for the day
  screen), the hydration mark read 0 because tsx's `__name` wrapper threw silently inside the
  init script, and `request.sizes()` reported cache hits as negative bytes — and each lie is a
  sentence in the script's header now. The baseline is written; `--check` holds the next change.
- [x] 131 **Four font weights shipped for one bold letter.** Found by the figures in #130: seven
  font files preloaded on every cold load, and weight 700 used once, on the brand mark. Fixed in
  P11I-4: three weights, the mark is 600, one file fewer per family on every first visit —
  re-measured, every cold screen is 35–40 kB lighter and live about 300 ms sooner.
- [x] 132 **A Save whose answer the wire lost made a twin.** Found walking the unhappy paths after
  #129: with the sentence "nothing was saved" on the screen the rep presses Save again, and the
  log — or the company, or the project — that had landed was written twice. Fixed in P11I-5
  (D134): the creating actions answer the same words from the same person to the same record
  inside two minutes with the row that exists (`src/lib/writes.ts`). `tests/unhappy.spec.ts` lets
  the request through, drops the answer, and counts one row.
- [x] 133 **A session that ended mid-form said "you are not allowed to do that."** Found reading
  `NotAllowed`: it carried the reason (`signedOut`) and every guard threw the reason away. Fixed in
  P11I-5 (D135): `refusalKey` in `src/lib/authz.ts`, nine guards answer through it, and the
  sentence says the session ended, nothing was saved, and the way back — sign in again in a new
  tab, press Save here once more. `tests/unhappy.spec.ts` deletes the page's own session row
  mid-form and reads the sentence with the words still in the box.
- [x] 134 **The prompt dialog painted the number red when the server was not reached.** Found by
  the guidelines review: every whole-form refusal was shown as the field's, with `aria-invalid`
  and the ring. Fixed in P11I-5: a field's refusal at the field, a whole attempt's in the footer,
  the field read-only rather than disabled while it saves so the caret stays, ids from `useId`,
  and `dir="auto"` on the reason.
- [x] 135 **The sign-in card jumped when the server was out of reach.** Found by the guidelines
  review: the error slot was one line, sized for the credentials sentence (D67), and the wire's
  sentence takes two at 375. Fixed in P11I-5: two lines are reserved, and the fields are marked
  invalid only when the server said they were.
- [x] 136 **The twin swallowed the correction it was meant to protect.** Found by the critic over
  the 11I diff, fixed in P11I-6 (D134). The twin matched on the words alone, so a second entry in
  the same words against another project of the same company, or the same words written again
  with the follow-up the rep had forgotten, was answered with the first row and its own row never
  written — while the screen said "Logged". Worse, it did not exclude archived rows, so unfiling
  an entry and writing it again — the only way to fix a wrong day (D70) — put the unfiled row's
  id back and nothing appeared. Fix: every stored field is compared (`sameField`), archived rows
  are excluded, and the company and project twins compare their whole form, the first contact's
  phone included. `tests/unhappy.spec.ts` unfiles an entry and writes it again.
- [x] 137 **Three reads called an action bare, and the lint could not see them.** Found by the
  critic, fixed in P11I-6. The dispatch dialog's remaining items and last dispatch, and the
  quotation dialog's last quotation, were `.then` chains with no catch: with the wire cut and the
  lookups already cached, the dispatch form sat on its skeleton for ever with no sentence. The
  rule only matched `await`, so it called this shape guarded when it was not. Fix: the three go
  through `useWireGuard`, and the rule gained the `.then` shape and the JSX `action=` shape —
  proved by linting a file that has both.
- [x] 138 **The user menu told an expired session it was not allowed.** Found by the critic, fixed
  in P11I-6 (D135). The theme and language actions, the search and the ten form lookups guard
  themselves instead of through a shared `guard()`, and each one caught everything and answered
  "You are not allowed to do that" — including the session that had simply run out while the menu
  sat open, which is the commonest failure there. Fix: all thirteen answer through `refusalKey`,
  and a failure that is not a refusal says `somethingWrong` rather than accusing anyone.
- [x] 139 **The speed harness could print green having measured nothing.** Found by the second
  critic pass, fixed in P11I-7. Its options were only understood as `--runs=3`; written the way its
  own header showed, `--runs 3`, the value became the string "true", the count NaN, the loop ran
  zero times — and the table of empty cells passed `--check` with "no screen is slower or heavier"
  and exit 0, while `--write` saved a baseline of `{}` that made every later check pass for ever.
  Fix: the parser takes both forms, refuses an option it does not know, and a figure that is not a
  number fails the run before anything is written or compared. A guard that cannot fail is not a
  guard.
- [x] 140 **An interrupted reads run left the whole cluster logging every statement.** Found by the
  second critic pass, fixed in P11I-7. `alter system` writes the container's own configuration
  file, not the connection's, and the only undo was a `finally` — which Ctrl+C during a run of
  forty-three screens never reaches. Statement logging would have stayed on for every database in
  that container, the test suite's included, across restarts, and the four sessions the run made
  would have stayed alive. Fix: one `putBack`, called from the `finally` and from SIGINT, SIGTERM,
  SIGHUP and SIGBREAK. In the same pass the check learned to fail on a screen that answered with
  an error or whose markers never reached the log: zero statements is a measurement that did not
  happen, not the best figure in the table.
- [x] 141 **Three smaller things the second pass found.** All fixed in P11I-7. The company twin
  compared the whole company but only the contact's name and phone, so a corrected position, email
  or note on the second press was swallowed — it compares all five now. `common.signedOut` is
  reached only through `refusalKey`, so no call site writes it and `unused-messages` was blind to
  it: `REFUSAL_KEYS` is exported from `src/lib/authz.ts` and read as a message family, the way
  every other computed key is. And the docs said `npm run measure:reads --check`, which npm eats
  before the script sees it; both here and in README it is `-- --check`.

Left for the founder, from the measurements and the critic. A request for a quotation or a
dispatch has no twin guard: those two writes carry line items, so "the same write" means comparing
every line of two papers, and it was not worth doing half. If the wire eats the answer to a
request, the coordinator can get two identical papers seconds apart; the rep may withdraw his own
(D32) and she may send one back, so nothing is stuck, but nobody is told why there are two.

Refuted this box. The withdraw test's `pickFirst` hang (I6, seen once in the 11G gate) did not
come back in eight runs of `tests/quotations.spec.ts:608` after the 11H opener fix (#127); it is
treated as the same defect and closed. The pinned weekday (P10b) is decided against: the
tests that depend on the working week branch on today's weekday and assert both sides
(leave, reports, figures, manager), and a clock pinned in the app while the database keeps
its own `now()` would split the one definition of today (rules/data.md) — the suite runs on
the day it runs.

Left for the founder, measured and not fixed. The document of a list screen is 500 kB decoded
on the volume floor — the server-rendered HTML and the same tree again as the payload React
takes over — and the phone parses both; the fix is fewer client components per row and less
per row, which is a design change to the tables and not a box-11I one. Every screen also fires
some twenty prefetches on load (one per link in view, in two flavours), each a server render of
the layout with its session read; the reads harness counts the document alone and does not see
them. A refusal toast on the phone covers the sheet's own Save button for the seconds it shows.
`FormFooter` disables the pressed button while it saves, which is the double-press guard and
also drops keyboard focus to the page; and its pending word is "Saving…" whatever the verb was.

What a good CRM has that Kladra does not (P11J). Seven readings of the app — the rep's day, the
coordinator's desk, the manager's week, the founder's question, the feature surface of the CRMs
of 2026, FACET as it was actually used, and the cladding trade in Saudi Arabia — proposed
freely; each proposal was then read against the same three questions (whose is it, when in
their day, what does it replace) and against the code, and most of them died there. What
survived is below; what did not is in DESIGN §4 and §6, with the reason.

- [x] 142 **Three fields were written by everybody and read by nobody.** Found by the rep's
  reading, fixed in P11J-1 (D136). The founder asked for Notes on the company, on the contact
  captured with it and on the project (SPEC §3); all three are kept, queried and carried into the
  drawer — and the drawer spent them on the Edit form and rendered none of them. A rep in a lobby
  who wants the sentence he wrote in March has to open a form to read it, which is why the field
  quietly stopped being used. Fix: each note is read where its record is read. The labelled typed
  block was already solved once on the quotation sheet, so the pattern became `NoteBlock` and the
  five sites share it. `tests/notes.spec.ts` walks all three and the manager who may not write.

- [x] 143 **The coordinator's desk had two search boxes over one URL, and ran newest first under a
  caption that says oldest.** Found by the coordinator's reading, fixed in P11J-2 (D137). Four
  screens search a list and four boxes were written: one component on companies, and a hand-drawn
  one inside each of the projects, quotations and dispatches tables — which is why #121's clear
  button had to be fixed three times. The queue renders two of those tables, so it drew two boxes
  over one screen: both wrote `?q=`, each wrote its own `?status=` over the other's, and the
  second box showed empty above a list that was already filtered, because a box holding its own
  text cannot hear another one. Second fault on the same screen: `listQuotations` and
  `listDispatches` order newest first — right for every screen where somebody looks something up,
  wrong for the one desk that is worked DOWN, where it puts the row she must answer next at the
  bottom and lets the row cap drop the oldest. Fix: `ListSearch` is the box, the three tables take
  `showSearch={false}` and the queue draws one over both lists; both queries take
  `order: "oldest"` and the queue passes it. `tests/queue.spec.ts` asserts one search role on the
  desk, the term written once, and the longest wait as the first row.

- [x] 144 **The coordinator prices projects that have already been given up.** Found by the
  coordinator's reading, fixed in P11J-3 (D138). `markProjectLostAction` stamps `lost_at` and
  nothing in the quotation or dispatch chain has ever read it — the only place that knows about
  lost is the gate that refuses a NEW request. So the race is real and invisible: the rep marks
  the project lost, his request stays in her queue looking exactly like work, and she prices a job
  whose answer is already no. Fix: `projectLostOn` and `projectLostReason` on `QuotationRow` and
  `DispatchRow` — `projects` is already joined, so it is two more columns and no new join — read
  as a Riyadh day in SQL the way `issuedOn` is; one red line under the project name on the row,
  the day and the reason in the drawer. Nothing is withdrawn on anybody's behalf. The demo had no
  lost project at all, so it gained one, with a request still waiting on it.
- [x] 145 **A stored code was printed on a screen.** Found by the same reading, fixed in P11J-3.
  `projects.lost_reason` is a code for the nine reasons and the rep's own words for the tenth; the
  projects table knew that and kept the rule in a client hook, and the company drawer rendered the
  column. A rep opening a customer read "competitor". Fix: `src/lib/loss-reason.ts` owns the list
  and the one reader, both screens use it, and `check-messages` reads the union from its new home.
- [x] 146 **The palette sent the coordinator to a screen with nothing on it.** Found by the
  coordinator's reading, fixed in P11J-3 (D139). The search action shows her every company on
  purpose and the palette sent every company hit to `/companies?open=`, which narrows to the
  reader's own floor — hers is empty — so she got "Nothing here yet" under a panel saying the
  company she had just read the name of "is no longer available", on a screen her rail does not
  even list. Fix: the destination is a function of the role, and hers is her own quotations
  screen filtered to that company. Contacts route through the same rule even though she is shown
  none.

What P11J-3 did NOT do, and why. Marking a project lost still says nothing about a request
waiting on it: warning the rep at that moment needs the count on the project drawer, four files
deep, and the harm it prevents is a glance now that her desk says it. It is worth doing the day
the project drawer next opens for another reason. And the queue's own row links still carry
`?status=requested`, which the queue does not read: harmless, and not worth moving the parameter
that decides which drawer opens mid-slice.

- [x] 147 **Nothing said what we lose to.** Found by the founder's reading, fixed in P11J-4
  (D140). Jerom's five questions got the chain card in P9 — of a quarter's quotations, where did
  each end up — and the half underneath it was never built: when a project dies, what killed it.
  The data was there the whole time, because Mark lost has refused a save without a reason since
  P3, and the column had exactly one reader, on the project it belonged to. Fix: `lossCohort` in
  `src/lib/losses.ts` over the chain card's own window, the nine codes bound from the constant
  rather than written again in SQL, anything else folded into `other` by the same rule
  `lossReasonLabel` reads by; `LossCard` beside `ChainCard`, metres first, one neutral tone. The
  demo carried no lost project at all before P11J-3 and now carries five, on three floors, for
  four different reasons and one written line.

- [x] 148 **Two clocks on one screen.** Found by the manager's reading, fixed in P11J-5 (D141).
  `stuckList` filters waiting requests in TypeScript on purpose, and says why four hundred lines
  above: the weekend and the holiday table are `@/lib/workdays`'s business and a second copy of
  that arithmetic in a `case` expression is how a rep back from Eid gets told he is late. The
  follow-up half of the same function then did exactly that, in two statements, for the count and
  for the threshold — so a call promised for Thursday read "3 days overdue" on Sunday beside a
  request from Thursday reading "1 working day". Fix: SQL returns the day, `workingDaysBetween`
  ages it against the rep whose call it is, and the calendar cut that survives in the WHERE is a
  deliberate superset with the reason written on it. The uncovered band is aged the same way, and
  the holiday window now reaches back to the oldest FOLLOW-UP as well as the oldest request —
  the D97 bug would have come straight back through the new arithmetic otherwise. The demo moved
  with the rule: its longest-overdue follow-up was four calendar days past, which is never three
  working days past, so the band it is meant to fill was empty in every screenshot ever taken of
  that screen. It is nine days past now.
- [x] 149 **The strip said the team's gone-quiet total and the table said whose the OTHER figure
  was.** Found by the manager's reading, fixed in P11J-5 (D142). Every other figure on that strip
  has a column under it. `TeamMemberRow` gained `goneQuiet` from the same `followUpCountsForRep`
  the never-contacted figure already came from, so a row and the strip above it cannot drift, and
  the figure opens that rep's quiet list.

What P11J-5 deliberately did NOT change: `goneQuietCompanySql` and `neverContactedCompanySql`
still count CALENDAR days. They were on the list as the same defect and they are not one. Those
two measure a customer's silence rather than a person's lateness: a fortnight without a word is a
fortnight whoever was at work, the bands accuse nobody, and counting working days there would
delay surfacing exactly the customers somebody should ring the morning he gets back from a
holiday. The rule that tells the two apart is now in DESIGN §5, which is the change that was
actually needed.

- [x] 150 **The dispatch was the one record that could not say what had happened to it.** Found by
  the coordinator's reading, fixed in P11J-6 (D143). Its five transitions have been writing audit
  rows since P5 — requested, quantities edited, approved, number corrected, refused with her words
  — and the drawer read none of them, so a refusal and the resubmission after it were invisible on
  the screen they were about. Fix: `src/lib/dispatch-events.ts` is the list, the actions build
  their audit string from it, `dispatchHistory` reads the log the way `quotationHistory` does, and
  `DispatchHistory` draws it last in the sheet. `check-messages` reads the new union, so a sixth
  transition cannot ship without a sentence in both languages. "was {number}" moved to `common`
  on the way past: one sentence, said by both chains, had been two keys. `tests/smac.spec.ts`
  asserts the one line this trail draws that no event on it draws — the number it used to carry,
  under the correction — which the dialog's own hint promises in both languages and nothing
  checked.

- [x] 151 **Her desk counted itself off two capped arrays.** The stranger read's #33, fixed last
  in P11J-7 (D144). `waiting`, the two late counts and the longest wait were all derived from the
  rows the two lists had been given, and a list is two hundred rows (D80). The fix had to avoid
  the trap the comment above it names — a hand-written second query over the same tables once put
  a request on the strip that neither list showed (D95) — so the new read goes through `narrowTo`,
  the predicate the list and the count already share, and asks for one column with no cap. The
  working-day arithmetic stays where it belongs (D141). Both lists gained the tail every other
  list screen has had since D80.

- [x] 152 **The demo approved two dispatches the day before they were raised.** Found by the
  critic pass over P11J-6 and fixed in the same slice. The seed builds a dispatch's two instants
  on two clocks: `createdBack` counts WORKING days back from today, and `approvedOnDayOfMonth` is
  a fixed calendar day of this month, because a month is counted from its approvals and the demo's
  months must not move (S41). Past the first days of a month the working ladder overtakes the
  fixed day — on Tuesday 8 September, three working days back is the 3rd, and "approved on the
  2nd" is the day before — so two dispatches carried an `approved_at` earlier than their
  `created_at`, and an `updated_at` earlier still. Nothing read the pair in order for five phases.
  P11J-6 put the trail on the drawer and its first line said "Approved" over "Requested", on the
  two current-month dispatches a reader is most likely to open. Fixed in three places, because
  one of them is the cause and the other two are the guard: the seed derives an approved
  dispatch's raising day from its approval day rather than from the ladder; the trail's own spec
  asserts the first line is the request; and the database refuses the shape outright
  (`dispatches_approved_after_created_check`, migration 0013) — the app cannot write it, but a
  seed, a migration or the import that will exist next year can, which is what the rest of that
  table's checks are for.

- [x] 153 **The chips over a list were five components, and the row they sit in was four.** The
  wrap was seen on the 375 shots in P11H and parked for box J as the search-box question's
  neighbour; fixed in P11J-8 (D145). The symptom was the quotations list at 375, where the
  list/board switch, four status chips and «All» were one wrapping row and «All» came round
  underneath behind a divider, reading as a group of one. Reading for the cause found the rest of
  it: the projects screen had its own private copy of the chip — a default-size square button, a
  different height from the four on the other screens, and with no `LinkPending`, so it was the
  one filter in the app that gave no sign it had been pressed (D126). Fix: `FilterRow` holds the
  layout rule once and `FilterChip` gains the one thing the private copy had, in the app's own
  words for the two tones; the four rows and the five chips are one of each.
  `tests/filters.spec.ts` asks the pixels, so a sixth copy is a different height and fails.
