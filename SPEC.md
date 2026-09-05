# SPEC — Kladra

Kladra is the CRM and operations tool for Technopanel, a Riyadh company selling aluminium
composite panel (ACP) cladding. Fourteen people. It replaces FACET, whose interface users
rejected as overwhelming, record-first and slow. This file is the business (§2, extracted from
FACET's SPEC and its thirty archive documents at C:\Projects\facet-crm), the founder's decisions
(§3) and the defaults Claude chose (§4). How it looks is DESIGN.md.

## §1 People

- **Rep** — owns companies, logs what happened, requests quotations, raises dispatches, chases customers. Has a monthly m² target.
- **Coordinator** — the desk: issues quotations in SMAC and types the number back, or sends a request back; approves or refuses dispatch requests. No target.
- **Manager** — sees every rep, every company, the team table and what is stuck. No personal target; the company target is his measure.
- **Admin** — users, passwords, targets, lookups, holidays, export. Sees what the manager sees.

Real team: Jerom (admin) · Abdulrahman Al-Zahrani (manager) · Rawan (coordinator) ·
Faisal Al-Harbi, Saad Al-Qahtani, Turki Al-Shammari (reps). Marketing works as a rep for now.

## §2 How the business works

**The company and its tools**
- S1 Technopanel is a Saudi supplier of cladding and aluminium composite panel. Riyadh is the main location; the Eastern and Southern provinces each have a rep who opens the local warehouse.
- S2 About fourteen people use the system and there is no IT team.
- S3 SMAC, the company's ERP, is the record for money: quotations, invoicing, finance, tax, stock. Kladra is the record of work: who owns which relationship, what was promised, what actually moved. It never takes on finance.
- S4 There is no integration with SMAC. Every SMAC number is typed by a person and can be wrong.
- S5 The unit that matters is the square metre, tracked monthly. Money is the finance department's concern.
- S6 English is the main working language; Arabic is available for those who find English hard. A company, contact or project has one name, in whichever script the rep prefers.
- S7 Nobody self-registers. Accounts are created by the admin and deactivated, never deleted, so history always points at a real person.

**Who sees what**
- S8 Reps see only their own companies; the manager sees everyone's. A manager who sells carries no personal target because his metres are already in the company total.
- S9 The coordinator runs both chains, quotations and dispatches, and deals with SMAC and finance. She does not own customer relationships.
- S10 Customers never use the system; whenever a step waits on the customer, the rep is responsible for chasing.

**Companies and contacts**
- S11 The customer is the company. The people at it are contacts. A contact belongs to one company; a person who moves gets a new contact at the new company, and the old one stays for history.
- S12 Companies arrive from a rep's own search, from marketing, a referral, an exhibition, online or WhatsApp. Lead source is how the founder learns where business actually comes from.
- S13 The rep who adds a company owns it.
- S14 The phone number is the strongest sign that two records are the same company: names vary, numbers rarely do. +966, 00966, 966 and a leading 0 are the same number.
- S15 A company is always created even when it looks like a duplicate; nothing blocks the rep.
- S16 Nothing is deleted. A company nobody works any more is archived: if it resurfaces in two years the record shows it was already known and why someone gave up on it.
- S17 Between one and two companies a day arrive in steady state, up to a few hundred a month after an import.

**Projects**
- S18 A project is a job at a customer, a tower, a villa, a mall, and every quotation belongs to one.
- S19 Expected m² is the rep's own estimate and the anchor number of a project. The pipeline total is the sum of expected m².
- S20 Lost is the rep's judgement, requires a reason, and closes the project. A rejected quotation is not a lost project; the project continues.
- S21 Won is never set by hand. A project is won when a dispatch against it is approved.
- S22 Cladding sales are project-driven with long cycles and many enquiries that never mature. Ten 50 m² quotations must not outweigh one 5,000 m² quotation.

**The log**
- S23 Reps work in the field and log a visit standing in a lobby with a phone. Logging must take under a minute, or it is filled in later from memory, which is a permanent guess.
- S24 A log entry is about one company, may name a contact and a project, records the channel (visit, call, WhatsApp) and what happened in the rep's own words.
- S25 Sales activities, catalogue sent, samples, documents, visits, calls, happen in any order and any number of times. They are not stages.
- S26 A rep is asked to write only what the system cannot see. If it can be known from an event, nobody is asked and no second copy is kept.
- S27 The history of a company is the manager's daily report. There is no separate report to write or submit.

**Quotations**
- S28 A rep raises a quotation request with all the lines. The coordinator creates the real quotation in SMAC and types its number back; that is when it is issued.
- S29 The coordinator can send a request back for edits, with a reason, and the rep who raised it is told.
- S30 The physical signature on the quotation is management's approval, price included. There is no separate price-approval step.
- S31 Prices are per m² in SAR. m² = pieces × width × length, never typed. VAT is 15%, fixed. Where Kladra's figures and SMAC's disagree, SMAC is right.
- S32 A line names supplier (N, K, C, D), class (A, B, A2G1, A2G2), fire rating (B1, A2, Normal), colour code, thickness, width, length and pieces. 4 mm is the standard thickness; a standard sheet is 1.24 × 5.8 m; coils are production's concern, not sales'.
- S33 Colour is a code such as 168, typed; occasionally a RAL or Pantone value.
- S34 A revision is a new quotation linked to the old one; SMAC puts RE before the number. Earlier versions stay readable; only the latest is live.
- S35 Quotations are never summed. A project quoted three times at 2,000 m² is 2,000, not 6,000.
- S36 The customer's answer belongs to the quotation: accepted, or rejected with a reason.

**Dispatches**
- S37 A dispatch is the customer's reply to a quotation. Cladding is taken in stages, so one quotation normally produces several partial dispatches; quoted, paid and dispatched quantities differ.
- S38 A dispatch may only be raised against an issued quotation.
- S39 The rep raises the dispatch request; the coordinator checks it against the quotation and approves it with the SMAC dispatch number, or refuses it with a reason.
- S40 Shipment is CT (the customer's own truck), TT (a Technopanel truck) or Cargo (a third party); the rep chooses.
- S41 Approval is final and is the only event that counts: not the request, not the number. If something goes wrong afterwards a new dispatch is raised.
- S42 Dispatch normally happens in the same month as the order; dispatching before the cladding ships is rare.

**Targets and counting**
- S43 Targets are m² per month per rep, set by the admin. Achievement is derived from approved dispatches; nobody types how much they did.
- S44 The company target is one figure per month set by the admin alone. It does not derive from the reps' targets and they do not derive from it.
- S45 A rep with no target still appears with all his real figures and a dash where the target would be.
- S46 Target progress and activity are shown side by side and never combined into one score. Nothing scores a rep.

**Calendar and follow-ups**
- S47 Friday and Saturday are the weekend for everyone; Saturday work is recorded, never required. A day is a Riyadh calendar day.
- S48 Public holidays such as Eid affect everyone; personal leave affects one person. Both are skipped by pace and reminders: a rep back from two weeks off must not be told he is behind.
- S49 Pace is working days done over working days in the month. In the first five working days it reads "the month has just started".
- S50 A next-follow-up date set by the rep silences chasing until it arrives and then becomes the reminder. Due today is due, not overdue.
- S51 A company added and never contacted reminds its rep after 14 days, and the manager sees a per-rep count, because adding forty companies and working none is a real habit the founder wants visible.
- S52 A reminder is cleared by doing the work, never by dismissing it.
- S53 A decision that ends someone's work, a request sent back or refused, a quotation rejected, reaches them with its written reason.

**Records**
- S54 Today reps and the coordinator negotiate quotations over WhatsApp, where the record vanishes. The aim is the outcome written on the record.
- S55 Every change is audit-logged with who, what, when and which record.
- S56 The pilot is two or three reps for a month before rollout. Open decisions are revisited after the first month, three months and a year of real data.
- S57 Success in six months: the manager sees pipeline, targets and activity without asking anyone to assemble anything, and no rep keeps a private spreadsheet.

## §3 Founder decisions from user testing

- Company has NO phone; phone is on the contact and mandatory there.
- Company form: Name · Category (Other last) · Lead source (Other last) · Country (Saudi Arabia default) · City (Riyadh default) · Notes. Contact captured in the same popup: Name · Phone · Position · Email · Notes.
- Lead sources: no Contractor, no Architect; Online and WhatsApp separate; Other last.
- Countries pinned: Saudi Arabia, UAE, Bahrain, Kuwait, Qatar, Oman; rest alphabetical; searchable. Cities pinned: Riyadh, Jeddah, Dammam, Khobar, Makkah, Madinah; rest alphabetical; searchable. Non-Saudi → city free text.
- Project: no state at creation; "Mark lost (reason)" is a later action. No in-production / committed flags.
- Next follow-up: date picker, shown at top, surfaces as due today / overdue on the rep's home. Date format everywhere 04/Aug/2026.
- Quotation lines are Item 1, Item 2… Columns: Colour code · Supplier (N/K/C/D) · Fire rating (B1/A2/Normal) · Class · Qty · Thickness · Width (1.24 / 1.5 / 2.0 / Other → number) · Length · Price per m². m² = width × length × qty. Line total, VAT 15% and grand total shown live. No internal codes shown, ever.
- Quotation raised from inside a company or a project, in a popup.
- Coordinator's quotation actions are exactly two: Issue (enter SMAC number) and Send back (reason). Customer accepted / rejected (reason) is the rep's action, on the rep's screen, after issue.
- Dispatch raised from an issued quotation, in a popup: pick items and quantities (partial allowed), shipment method, destination, payment terms written by the rep. Coordinator checks, then Approve (enter SMAC dispatch number) or Refuse (reason). Approved m² counts toward the rep's target in the month of approval.
- Manager has no personal target; sees the company target and everyone's achieved, his own included as team.
- Admin sets all targets, manages users, resets any password, edits lookups and holidays. Admin only can export.
- No comments feature. No refresh buttons: the screen updates itself.
- Sidebar collapsible. Searchable dropdowns. Date pickers. Loading states. Transitions. Toasts.
- Every phone number is stored normalized (E.164, +966…) and displayed local (05x xxx xxxx). Input accepts 05x, +966, 009665. Duplicate warning matches on normalized phone. (P3)
- Tapping a phone anywhere opens WhatsApp via wa.me; long-press/secondary shows the number. (P3)
- Ctrl+K / Cmd+K opens global search from any screen. (P2)
- The app is installable on a phone (PWA manifest, icons, offline splash only — no offline data). (P7)
- Sessions last 30 days; sign-out is explicit. (P2)
- Every empty list shows one sentence and its primary action. (all) — narrowed by D23 and D31, which say what happens when the action does not apply or does not exist yet.
- List filters and the open drawer are reflected in the URL. (P3+)
- Archive, never delete: companies, contacts, projects get archived_at; archived rows hide from lists and stay in history. Admin can restore. (P3)

Jerom used the app himself before P8. His verdict was that it beats FACET and is worth deepening. These add to the list above; none of them replaces anything in it. (P8)

- Every list creates from its own screen. Projects, quotations and dispatches had no primary action of their own and he had to go hunting through a company. Where the record needs a parent, the button asks for the parent instead of not existing. (P8)
- The side panels are reworked: what a person needs first is at the top, and a panel has a hierarchy rather than a flat list of fields. (P8)
- Square metres are the headline figure on quotations and dispatches. Price is the quiet supporting one, because SMAC owns money. (P8)
- Colour carries meaning: state, overdue, stuck, ahead of target, from one small set used the same way everywhere. Never colour for decoration, and never colour alone. (P8)
- A dashboard per role, each answering that person's daily question: the rep's day, the coordinator's queue, the manager's team. Not a generic grid of cards. (P8)
- The admin can view the app as any role or any person, clearly marked as viewing, to check and test it. (P8)
- Roles may grow beyond the four if the business needs them. (P8)
- Where a screen earns more than one view, the default is the one that answers the daily question, and the choice is remembered per person and carried in the URL. Which screens earn which views is decided in DESIGN §6, with the reason. (P8)

## §4 Defaults Claude chose — founder may change

- D1 Lead sources, in order: Field visit · Direct contact · Referral · Exhibition · Marketing · Online · WhatsApp · Other (FACET's list with "Online or WhatsApp" split and "Consultant or architect" dropped, per §3).
- D2 Categories, FACET's list in the founder's order: Factory · Contractor · Advertising · Real estate · Owner · Consultant · Station management · Workshop · Personal · Other.
- D3 Suppliers N, K, C, D: the full name equals the code until the admin types a real one (FACET recorded none; the founder said the code is the name).
- D4 Fire ratings B1 · A2 · Normal (عادي). Classes A · B · A2G1 · A2G2. Thicknesses seeded as FACET had them, 2–8 mm, with only 4, 5, 6 active and 4 mm preselected.
- D5 Width chips 1.24 · 1.5 · 2.0 · Other; 1.24 preselected. Length is typed (5.8 is the standard sheet). Colour code is required free text.
- D6 m² and money show two decimals with thousands separators and Western digits in both languages; rounding is half-up per line.
- D7 Countries: FACET's nine (Saudi, UAE, Bahrain, Kuwait, Oman, Qatar, Egypt, Jordan, Syria) plus the rest of the ISO list in English and Arabic; the six pinned first. Cities: FACET's 171 Saudi cities, six pinned first. Both searchable in either script.
- D8 Duplicate warning matches a company name (case-insensitive) or a contact's normalized phone across all reps; it names the company and its rep and never blocks saving.
- D9 A company's next follow-up is set by the latest log entry or by the picker at the top of its drawer. A project has its own. The home strip counts both, plus never-contacted companies older than 14 days; clicking it lists them.
- D10 Quotation numbers are Q-1, Q-2 …; a revision is Q-12/2 and copies every line. Revise is offered on issued, accepted and rejected quotations. A rep may cancel his own quotation while it is requested or returned; nobody cancels an issued one.
- D11 The rep's Customer rejected does not mark the project lost; Mark lost stays a separate action on the project.
- D12 Dispatch numbers are D-1, D-2 …. Shipment methods are FACET's CT · TT · Cargo, editable in Lookups. Destination and payment terms are free text, both required. A dispatch cannot exceed the quotation's remaining quantity per item.
- D13 Notifications are stored as a kind plus parameters and rendered in the reader's language.
- D14 Manager "Stuck": requests waiting more than 2 working days · follow-ups overdue more than 3 days · companies never contacted for more than 14 days.
- D15 Coordinator has no companies of her own; her home is the Queue. Admin sees the manager's home plus an Admin menu.
- D16 Language is saved per user (user menu); theme is saved per browser (cookie), dark by default.
- D17 Passwords are at least 8 characters; deactivating a user ends their sessions at once.
- D18 The first contact added to a company is its main contact; any contact can be made main later.
- D19 Export is three CSV files (companies with main contact, quotations with items, dispatches with items), UTF-8 with BOM so Excel opens Arabic correctly.
- D20 Target card pace compares achieved ÷ target with working days elapsed ÷ working days in the month.
- D21 Contact positions: FACET had no list (free text). Kladra seeds a searchable list the rep can also type over: Owner · General manager · Project manager · Procurement · Engineer · Site engineer · Architect · Consultant · Accountant · Other.
- D22 The log's channels are visit · call · WhatsApp · other (FACET's list without email and meeting, per the brief).
- D23 A company list that comes back empty says why: nothing matched the search, nothing matched the filter, or there are no companies yet — and only the last of the three offers Add company. Offering it to a rep whose search simply missed answers a question he did not ask.
- D24 Archiving asks first, for a company, a contact or a project. It is not destructive, but it takes a row off the rep's floor, and a row that vanishes with no warning reads as a bug. An archived company still opens by link and can still be edited; it accepts nothing NEW — no contact, no project, no log entry, no follow-up date — because those would hang off a row that appears on no list. The admin's restore screen is P6.
- D25 Editing a company, a contact or a project opens the same fields as adding one, on what is already there, minus the thing that cannot move: a company's first contact (contacts have their own list), a contact's company (a person who moves is a new contact there, S11), and a project's company (moving one would take its whole log off the customer it happened at, S18).
- D26 Lists are not virtualized. Fourteen people, and a rep sees only his own companies; the day a manager's list passes a few hundred rows is the day to revisit it.
- D27 An unused message key is a lie about what the app says, so `npm run check:messages` now fails on one. A key built at runtime marks its whole prefix reachable — the alternative is deleting a string a screen shows.
- D28 The tests own a second database, `kladra_test`, and a second port, 3101 (`npm run dev:test`). They delete every row and seed fresh ones on every run, so sharing the development database meant a test run wiping the records somebody was looking at — which happened, and half of one review's findings were symptoms of it. The name is derived by appending `_test` rather than configured, so no `.env` can point a run at real data by omission; before deleting anything the suite asks `/api/health` which database is behind the port and stops if the answer is wrong. DEFAULT — founder may change.
- D29 Development servers listen on 127.0.0.1 only, like the deployed ports. `next dev` and `next start` default to every interface, which puts a signed-in copy of the CRM with the seed accounts on the office Wi-Fi. DEFAULT — founder may change.
- D30a A screen is marked live once React has taken over its HTML, and the tests wait for that mark after every page load. Without it a press that lands in the gap does nothing and the run fails at random. DEFAULT — founder may change.
- D31 **Overrules a §3 line** — "Every empty list shows one sentence and its primary action. (all)". An empty list shows one sentence and its primary action *where that action exists*. What was observed: every screen whose slice is not built yet rendered the action its sentence named, disabled, wearing the brand gradient — the one signal reserved for "this is the thing to press". On the empty companies page both Add company buttons came up that way. Pressed, nothing happened, and the screen read as broken rather than as unfinished, which is the exact impression that killed FACET. So where the slice is not built the sentence carries the news alone and, where the work can already be done somewhere else, says where; the action comes back with its slice. Everywhere the action does exist the §3 line stands unchanged, and D23 covers the third case, a list emptied by a search rather than by having nothing in it. DEFAULT — founder may change.
- D30 Arabic UI text addresses nobody's gender: the verbal noun rather than the imperative, and "الرجاء" where an instruction is unavoidable. Rawan reads this app all day and half of it was written to a man. `npm run check:messages` fails on the marked forms. DEFAULT — founder may change.
- D32 A rep may **withdraw** his own quotation request while it is still waiting or has been sent back, and only then. It leaves the coordinator's queue and keeps its whole history; nothing is deleted (S16). §3 gave the rep a way to raise a request and the coordinator a way to answer it, and no way to take back a request raised on the wrong project — which in FACET meant Rawan pricing something nobody wanted and finding out on the phone. The word is **Withdraw**, never "cancel": a cancelled quotation sounds like a lost job, and D11 already says a rejected quotation is not a lost project. DEFAULT — founder may change.
- D33 Every date on a screen is rendered by one component, and it takes the direction of its own text — never a forced `ltr`. Thirteen call sites had each decided that separately, so `04/سبتمبر/2026` could sit twice in one drawer under two conventions. Arabic reads it day-first from the right, which is how an Arabic date is written; English day-first from the left. A Playwright test measures the rendered order rather than reading the DOM, because the text is identical either way round. DEFAULT — founder may change.
- D34 The number a screen shows and the number WhatsApp is given are both the stored E.164 one, never the one the rep typed. The typed form exists only to fill the edit form back in. It is a distinct TypeScript type, so `formatPhone` and the wa.me link accept nothing else and `npm run typecheck` catches the substitution — which had already shipped: one contact's number showed ungrouped in the company drawer and its WhatsApp link carried no country code. DEFAULT — founder may change.
- D35 Anything that opens a dialog is rendered in one position, whatever the list under it happens to say. A trigger rendered inside an empty state is destroyed by the very save that fills the list, and a destroyed component's success effect never runs: the first quotation a rep raised on a project saved in silence and left him on the project, while the second one worked. Where the answer has to survive the form's own disappearance — raising a revision removes the button it was raised from — the action is awaited and answered on directly rather than through an effect (`useSubmitAction`). Where the drawer's action row already carries the button, the empty state carries its sentence alone rather than a second copy of it. DEFAULT — founder may change.
- D36 A dispatch goes against the LIVE revision of a quotation, never a superseded one. §3 and S38 say "an issued quotation"; once it has been revised the customer holds the new paper, and goods sent against the old one move on a price nobody agreed (S34, S35). The button is absent on a superseded revision and the action refuses it in a sentence. DEFAULT — founder may change.
- D37 A dispatch has no withdraw, and that is deliberate rather than an omission — the quotation chain has one (D32) and this one does not. A dispatch request the rep raised by mistake is refused by the coordinator with a reason, which is the conversation that was going to happen anyway and leaves the mistake and its answer both on the record. S41 already says a dispatch that goes wrong is replaced by a new one rather than edited, so a second way to make one disappear would argue with it. DEFAULT — founder may change.
- D38 Every figure the browser adds up while somebody types is computed by the same function the database uses, and a test compares the two on real numbers. `1.24 × 5.8` is `7.192`; rounding that to `7.19` before multiplying by thirty gives 215.70 where the answer is 215.76. The gap is six halalas and nobody would ever report it — they would just stop trusting the screen. DEFAULT — founder may change.
- D39 Countries and cities are not in Lookups. They are ISO reference data — 249 countries and 171 Saudi cities, seeded from a standard — and which few sit pinned at the top of the picker is a design decision rather than an opinion about the world. Renaming Saudi Arabia is not something an admin needs at ten at night; adding a company category is, and that is what the screen is for. DEFAULT — founder may change.
- D40 A lookup row is edited through the boxes its own list has, decided in code and never by the form: a supplier carries a code and a full name, a shipment method a code and both languages, a thickness a number in millimetres. One shared "name" box would have written an empty code into two tables that refuse one. The row reads back on one line as its values joined by · — "Factory · مصنع" — and that joined line is the name every confirm dialog says back. DEFAULT — founder may change.
- D41 A target box left blank clears the target rather than storing a zero, and each box saves on its own. Zero says "aim for nothing", which is a different sentence from "no target set" — the team screen shows a dash for one and a figure for the other, and every other figure on the row stays real either way (S45). One Save for a screen of eight boxes is how an admin who fixed one number and walked away changes nothing. DEFAULT — founder may change.
- D42 A manager and an admin read every rep's floor and write on none of it. S8 says the manager SEES everyone's companies, and WORKFLOW §3 says his screen is read-only; the code asked one question — "may he touch this?" — got "yes, he is the manager", and let him edit, log against, archive and re-follow-up any rep's records for three phases, with the drawer offering the buttons. Seeing and changing are two questions now (`mayOpen`, `mayWrite`), every write asks the second, and no screen offers work the action behind it would refuse. A manager who sells is not an exception: his own id is on his own companies, so he writes on them for the same reason Faisal does. The history of a company is the manager's report (S27), and a report he partly wrote is not one. DEFAULT — founder may change.
- D43 A refused box is answered at the box, on every form, not only on the ones a rep uses. `useSubmitAction` kept the action's whole-form sentence and threw its per-field answers away, so five dialogs built on it — add a user, a lookup row, a holiday, a dispatch request — put "Required" at the bottom of the dialog and marked nothing. An admin filling a category in two languages could not see which language was missing. The hook hands back the whole refusal now, the footer carries the sentence only when no box is carrying one, and the caret moves to the first refused box because a dialog can be taller than a phone. DEFAULT — founder may change.
- D44 Who carries metres is one sentence, used by both screens that ask: reps and the manager. The team table listed everybody who was not the coordinator, so the admin sat on the manager's main screen as a permanent row of dashes — no target, no companies, nothing achieved — while the targets screen already refused to give him a box. Two screens disagreeing about who has a month is how a figure ends up with two definitions. DEFAULT — founder may change.
- D45 A drawer takes focus itself when it opens; a form dialog still focuses its first field. Radix focuses the first tabbable control, and in the company drawer that was the follow-up date picker — so following a shared `?open=` link put a focus ring on a date nobody had touched and armed Enter to open a calendar. A drawer is a place a rep arrived at, not a question he was asked. Nothing is drawn round the panel's own edge, because an outline on something a person cannot act on says nothing; every control inside it keeps its ring. DEFAULT — founder may change.
- D46 Every value a sentence is handed is isolated from the sentence. The app wraps a code in `dir="ltr"` wherever a screen renders one itself, but a translated sentence cannot reach inside its own placeholders: `طلب {rep} عرض السعر {label}.` comes back as one flat string, and the full stop, the colon and the «guillemets» around a search term then settle against the paragraph instead of against the value they belong to. A customer called "3M Arabia", a project name in English inside Arabic quotes, an emailed reason — each puts a neutral character beside a run whose direction only the run knows. Unicode isolates fix it in one character each side, and they are added once where every message is loaded (`src/i18n/isolate.ts`), not by hand at forty call sites: a message written next year is safe without anybody remembering. Plurals keep their shape — `one {day}` is a branch, not a value. DEFAULT — founder may change.
- D47 On the manager's and the admin's screens, "Company" means Technopanel, and everywhere else it means the buyer. S44 is the founder's own sentence — "the company target is one figure per month" — so the label keeps his word rather than being quietly renamed, but the card does sit above a table of customer companies and the collision is real. It is one string each side (`team.companyMonth`, `admin.companyTarget`) if Jerom would rather read "Technopanel this month". The unit under it was wrong and is fixed either way: the target is set in square metres, and the hint said metres. DEFAULT — founder may change.
- D48 The month bar carries two marks and takes its colour from the gap between them. S46 forbids combining target and activity into one score, and nothing here does: the figures still sit side by side and the bar still shows the two of them, the fill for what has gone out and a notch for how far through the month the calendar is. What P8 added is the colour Jerom asked for on that gap — ahead is green, a little behind amber, properly behind red — and the band is deliberately wide, because a rep four per cent short on the eighth of the month has not gone wrong and a screen that says he has stops being read. In the first five working days it is grey, for the same reason the sentence beside it says the month has just started (S49). The bar was painted with the brand gradient before this; a gradient on a measurement is decoration, and DESIGN §4 keeps it for the primary button. DEFAULT — founder may change.
- D49 A rep's home is his day, not his company list. D15 gave each role one home and gave the rep his companies, which answers "who are my customers" — a question he asks a few times a week. The question he opens the app with is "what do I do now", and until P8 nothing answered it: he had to read a list, remember the dates and decide. `/day` answers it in one column, in the order the work should be done — his month, what has come back to him and is stopped, then who is owed a call, in three bands worst first. The company list is one press away and is still where he searches. The coordinator and the manager keep their own homes, because their screens already ask their own daily question. DEFAULT — founder may change.

## §5 One word per thing

The word on the left is the only one the screens use, in both languages. A
second word for the same thing is how two people end up describing the same
screen differently, and how a rep learns one name and reads another.

| On screen | بالعربية | What it is |
| --- | --- | --- |
| Company | الشركة | The organisation that buys. §2 S11 calls it the customer; the screens never do. |
| Contact | جهة الاتصال | A person at a company. Belongs to one company (S11). |
| Main contact | جهة الاتصال الرئيسية | The one contact a rep reaches first. One per company (D18). |
| Project | المشروع | A job at a company — a tower, a villa, a mall (S18). Never a "job". |
| Quotation | عرض السعر | Never a "quote". The phone's bottom bar shows **Quotes / العروض**, the only short form in the app, because five tabs do not fit across 375px. |
| Dispatch | التوريد | Goods moving against a quotation (S37). Not the same as **Shipment method / طريقة الشحن**, which is how they travel (S40). |
| Request | الطلب | What a rep raises and the coordinator answers, for both chains (S28, S39). The screens say request, never "raise". |
| Log entry | تسجيل النشاط | One thing that happened, in the rep's own words (S24). The word "record" is kept for the system of record (S3). |
| Follow-up | المتابعة | The next date something is owed on a company or a project (D9). |
| Lead source | مصدر العميل | How this company first reached Technopanel. |
| Archive | أرشفة | Takes a row off the floor and keeps its history (S16, D24). Nothing is deleted. |
| Mark lost | تسجيل كخاسر | Closes a project with a written reason (S20). Not archiving, and not a rejected quotation (D11). |
| Add | إضافة | The word for creating any record: Add company, Add contact, Add project. Never "New". |
| Choose | اختيار | The word for taking a value from a list. Never "pick" or "select". |
| Revision | المراجعة | A second version of an issued quotation, numbered Q-12/2 (S32). The first stays readable and is marked **Superseded / مستبدَل**. |
| Withdraw | سحب الطلب | The rep takes back his own request before it is answered (D32). Never "cancel" — a cancelled quotation sounds like a lost job. |
| Customer accepted / rejected | قبول العميل / رفض العميل | The customer's answer, recorded on the quotation (§3). The only place the screens say **customer**: everywhere else the buyer is the **Company**, and this is the one sentence where a rep is reporting what a person said. A rejected quotation is not a lost project (D11). |
| Approve | اعتماد | What the coordinator does to a dispatch request with SMAC's dispatch number (S39). It is the only event that counts toward a month (S41). |
| Refuse | رفض | Her other answer, with a written reason. A refused request gives its quantities back to the quotation (D12). Not the same as **Send back / إعادة للتعديل**, which is the quotation chain and expects the rep to fix it and ask again. |
| Left to send | المتبقي للإرسال | What a quotation line still has on it: quoted, minus everything on a dispatch that is waiting or approved (D12). |
| Pipeline | إجمالي الفرص | The sum of the expected m² on live projects (S45). Not a total of quotations, and not money. |
| Lookups | القوائم المرجعية | The reference lists an admin edits — cities, categories, suppliers, thicknesses. Never القوائم alone: the phone's bottom bar already says **Menu / القائمة**, and the two are one letter apart. |
| Rep | المندوب | §1. |
| Coordinator | منسقة المبيعات | §1 — Rawan. |
| Sales manager | مدير المبيعات | §1 — Abdulrahman. |
| Admin | مدير النظام | §1 — Jerom. |
