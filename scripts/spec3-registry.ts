/**
 * Every sentence in SPEC §3, and the test that proves it (P12).
 *
 * §3 is the founder's own list, written from watching people use Kladra, and
 * until now nothing in the repo ever compared it to the app. It went unnoticed
 * for seventy boxes that the quotation line never offered the widths a sheet
 * comes in, and that its columns have been in the wrong order since the first
 * commit, with a comment above them claiming they were the founder's order.
 * Both survived because the spec that fills a quotation line takes the defaults
 * and never opens those two controls, so no test ever looked.
 *
 * This is the data half of the gate. `scripts/spec3.mts` reads it and holds it
 * to §3 both ways: a bullet nobody claims fails, a claim whose sentence has
 * been reworded fails because the decision has moved and wants reading again,
 * and a named test that no spec has any more fails and says which founder
 * decision just lost its proof. That last one is the point — a renamed test
 * used to take a decision with it, quietly.
 *
 * `says` is copied out of the bullet, from the middle of it rather than the
 * opening words, so that tightening a lead does not break the link while a
 * change of meaning does. Where a browser genuinely cannot answer — a shape in
 * the database, a list that is seeded rather than shipped, a decision that
 * something is NOT built — `unproven` says so in one sentence and names
 * whatever does hold it. Where the app does not do what §3 says yet, `owed`
 * names the P12 slice that will, because an honest debt printed on every run
 * is worth more than a claim that would be a lie.
 */

export type Spec3Entry = {
  /** A verbatim fragment of the §3 bullet, long enough to match it and only it. */
  says: string;
  /** Exact Playwright test titles that prove it. */
  tests?: string[];
  /** Why this one cannot be a test, if it cannot. */
  unproven?: string;
  /** The P12 slice that will prove it, for a decision not yet built. */
  owed?: string;
};

export const SPEC3: Spec3Entry[] = [
  {
    says: "phone is on the contact and mandatory there",
    tests: [
      "Faisal's floor: a company, its contact, a visit, a follow-up coming due, a project, and archiving",
    ],
  },
  {
    says: "Country (Saudi Arabia default) · City (Riyadh default) · Notes",
    tests: [
      "Faisal's floor: a company, its contact, a visit, a follow-up coming due, a project, and archiving",
    ],
  },
  {
    says: "no Contractor, no Architect; Online and WhatsApp separate",
    unproven:
      "The lead sources are seeded rows an admin can edit (scripts/seed/lookups.ts, ordered with Other last by src/lib/lookups.ts), not strings the app ships, so what the founder left OUT of the list cannot be read off any screen.",
  },
  {
    says: "Cities pinned: Riyadh, Jeddah, Dammam, Khobar, Makkah, Madinah",
    tests: [
      "a Dubai customer's local number is a UAE number",
      "the same country picked twice leaves the city alone",
    ],
  },
  {
    says: "is a later action. No in-production / committed flags",
    tests: [
      "her desk says the project was marked lost, before she prices it",
      "and the drawer says which day, and why, in words",
    ],
  },
  {
    says: "surfaces as due today / overdue on the rep's home",
    tests: [
      "Faisal's floor: a company, its contact, a visit, a follow-up coming due, a project, and archiving",
      "every date on a screen reads the same way round",
    ],
  },
  {
    says: "Fire rating (B1/A2/Normal) · Class · Qty · Thickness · Width",
    tests: ["the line asks its nine boxes in the founder's order, quantity fifth"],
  },
  {
    says: "raised from inside a company or a project, in a popup",
    tests: ["the drawer asks which project the quotation is for, and refuses none"],
  },
  {
    says: "actions are exactly two: Issue (enter SMAC number) and Send back (reason)",
    tests: [
      "the quotation chain: request, send back, edit, issue, the customer's answer, a revision",
    ],
  },
  {
    says: "pick items and quantities (partial allowed), shipment method, destination",
    tests: [
      "the dispatch chain: request part of a quotation, the queue, approval, and what is left",
      "achieved metres stay with the person who earned them",
    ],
  },
  {
    says: "sees the company target and everyone's achieved, his own included as team",
    tests: [
      "Abdulrahman's floor: the company's month, everyone's month, and what is stuck",
      "the manager's five figures each say which number they are",
    ],
  },
  {
    says: "manages users, resets any password, edits lookups and holidays",
    tests: [
      "Jerom's morning: an account, a target, a list, a holiday, an export and a restore",
      "a rep who types an admin URL lands on his own home, and cannot download the data",
    ],
  },
  {
    says: "No refresh buttons: the screen updates itself",
    tests: ["the desk sees a request land, and the rep sees it go out — no reload"],
  },
  {
    says: "Sidebar collapsible. Searchable dropdowns. Date pickers. Loading states",
    tests: [
      "a collapsed rail is collapsed from the first byte of the next page",
      "dialogs zoom and drawers slide inside the band, and a row's flash is two seconds",
    ],
  },
  {
    says: "Input accepts 05x, +966, 009665. Duplicate warning matches on normalized phone",
    tests: [
      "a plus wins over the country, and 00 is a plus",
      "a phone already on the company is refused by name, not as 'something went wrong'",
      // And the other half of the sentence since P12-8: the match on the
      // normalized number is what raises the manager's flag (D158).
      "a rep is stopped by nothing, and the pair is on the manager's screen a moment later",
    ],
  },
  {
    says: "opens WhatsApp via wa.me; long-press/secondary shows the number",
    tests: [
      "a number on the day's calls is a message and a call",
      "a held number shows itself, and offers to be copied",
    ],
  },
  {
    says: "Ctrl+K / Cmd+K opens global search from any screen",
    unproven:
      "No spec presses the keystroke; the palette it opens is walked from its button in tests/lost.spec.ts, and the handler that listens for the key is src/components/shell/search-command.tsx.",
  },
  {
    says: "PWA manifest, icons, offline splash only — no offline data",
    tests: [
      "a phone is given everything it needs to install Kladra",
      "with no signal the splash appears, and nothing about a customer was kept",
    ],
  },
  {
    says: "Sessions last 30 days; sign-out is explicit",
    unproven:
      "Thirty days is an Auth.js session option and a cookie's own expiry, and no browser walk can watch a month pass; tests/helpers/auth.ts signs in and clears the session on every run.",
  },
  {
    says: "Every empty list shows one sentence and its primary action",
    tests: [
      "a board with nothing on it is a sentence, not six empty columns",
      "a child under an archived company gets a sentence, not a button; the company restored, it gets its button back",
    ],
  },
  {
    says: "List filters and the open drawer are reflected in the URL",
    tests: [
      "a stale or foreign ?open= leaves the list standing",
      "the URL wins, the person remembers, and the list is the default",
    ],
  },
  {
    says: "companies, contacts, projects get archived_at; archived rows hide from lists",
    tests: [
      "Faisal's floor: a company, its contact, a visit, a follow-up coming due, a project, and archiving",
      "an archived company warns as it is typed, with the day it left and the reason",
    ],
  },
  {
    says: "there is a second sales coordinator, and the queue is a desk two people share",
    unproven:
      "The decision is that nothing is built, and a browser cannot walk a screen that does not exist; what holds the half with teeth — the manager is not given the desk's actions — is tests/floor.spec.ts's role lists.",
  },
  {
    says: "the gone-quiet band on the rep's own list already says it",
    tests: [
      "the team row says whose customers have gone quiet, and it counts the rows its list shows",
    ],
  },
  {
    says: "Projects, quotations and dispatches had no primary action of their own",
    tests: [
      "a project is added from the projects screen, without going to find its company",
      "a quotation is requested from the quotations screen",
    ],
  },
  {
    says: "what a person needs first is at the top, and a panel has a hierarchy",
    unproven:
      "Whether the first thing in a panel is the thing a person needs first is a judgement about a whole screen rather than an assertion, and the shot-looker's screenshots at 1366 and 375 are what make it (WORKFLOW §3).",
  },
  {
    says: "Price is the quiet supporting one, because SMAC owns money",
    unproven:
      "Which of two figures on a card reads as the headline is size and weight on screen, not something a locator can ask; the shot-looker's screenshots at 1366 and 375 are what judge it (WORKFLOW §3).",
  },
  {
    says: "state, overdue, stuck, ahead of target, from one small set used the same way everywhere",
    tests: [
      "a status has exactly one tone, and the two chains agree about waiting",
      "the quotations list paints each status the tone the table gives it",
    ],
  },
  {
    says: "each answering that person's daily question: the rep's day, the coordinator's queue",
    tests: [
      "Abdulrahman's floor: the company's month, everyone's month, and what is stuck",
      "her desk is in the order she works it: the longest wait is the first row",
    ],
  },
  {
    says: "view the app as any role or any person, clearly marked as viewing",
    tests: [
      "Jerom checks a rep's screen, changes nothing, and stops",
      "a manager is offered no way to become somebody else",
    ],
  },
  {
    says: "Roles may grow beyond the four if the business needs them",
    tests: [
      "marketing is a rep in everything: its day carries a month, its rail the chain, and its own customer a price",
      "the role lists say exactly what the rules say",
    ],
  },
  {
    says: "the choice is remembered per person and carried in the URL",
    tests: [
      "the view a person chose comes back on another browser, and is only theirs",
      "the URL wins, the person remembers, and the list is the default",
    ],
  },
  {
    says: "between reps is the **sales manager's** action",
    tests: ["the sales manager moves a lead onto the floor that will price it"],
  },
  {
    says: "Marketing has its own module for bringing in a lead",
    tests: [
      // Filing IS the assignment: one Save and the customer is on the chosen
      // floor with somebody to ring on him, and the rep answers it from the
      // band above his companies, which clears it everywhere (P12-7, P13).
      "marketing files a lead with a phone and the customer's query as its one note, and the rep acknowledges it from the band above his companies",
      // "Or to herself": she has it, so there is nothing to acknowledge.
      "a lead marketing files onto itself is acknowledged at once, and nobody is told",
      // The other half of the founder's sentence — "does not use the Add
      // company form" — asked of the rule rather than of a screen.
      "marketing files leads and adds no company; everybody else with a floor does the opposite",
    ],
  },
  {
    says: "The Marketing lead source is not offered to a rep adding a company",
    tests: [
      "a rep is not offered the Marketing lead source, and marketing is not asked",
      // The other half of the same sentence: not offered is about CHOOSING, and
      // a company handed to him already filed under it stays his to work (#168).
      "a company filed as marketing's stays editable by the rep it is handed to",
    ],
  },
  {
    says: "a selling role too: department **Internal Sales**, her own m² target",
    tests: [
      "only the coordinator issues her own quotations, and it is not a floor rule",
      "the coordinator raises her own quotation and issues it in the same act",
      "her month is a row of figures on the manager's table, not a row of dashes",
    ],
  },
  {
    says: "A dispatch implies the customer accepted that quotation",
    tests: [
      "the dispatch chain: request part of a quotation, the queue, approval, and what is left",
      "the quotation chain: request, send back, edit, issue, the customer's answer, a revision",
    ],
  },
  {
    says: "One warehouse per whole quotation and per whole dispatch, never per line",
    tests: [
      "company → project → contact, in the order a rep has the answers",
      "the quantity typed on the line that still has room is what gets saved",
    ],
  },
  {
    says: "Payment terms are a choice plus notes, not free text",
    tests: [
      "credit is refused until the rep says what was agreed, and the desk reads it",
      "how a load is paid for is a choice the column holds to its own shape (0022, P12-10)",
    ],
  },
  {
    says: "Nothing is ever carried forward from a previous record into a new one",
    tests: [
      "a repeat request opens on nothing, and a second line on the first one's sheet",
      "the dispatch chain: request part of a quotation, the queue, approval, and what is left",
    ],  },
  {
    says: "every rep on it sees the company and all items beneath it",
    tests: [
      "two reps on one customer: a shared company, a shared project, and taking the company back",
    ],
  },
  {
    says: "every rep on it works it fully",
    tests: [
      "two reps on one customer: a shared company, a shared project, and taking the company back",
    ],
  },
  {
    says: "chosen per quotation and per dispatch and is never inherited",
    tests: ["credit is chosen per record, and a job one rep works is asked nothing"],
  },
  {
    says: "the rep's target, the manager's table, the metrics",
    tests: [
      "a shared job's metres are split, and the drawer says who took what",
      "the month a rep is shown is the month he was credited",
    ],
  },

  // ---- Phase 13: the founder's second round, owed to the slice that builds each (WORKFLOW §0) ----
  {
    says: "Any difference from the quotation is flagged on the dispatch for Rawan",
    tests: [
      "a load opens on its quotation's lines and services, and the two things the rep changed are what the desk reads",
      "a direct dispatch: no quotation, one priced line, approved, and the metres are the rep's",
      "a refused dispatch is corrected and sent again, back on the desk, its difference worked out again",
      "a partial quantity is nothing: the quantity is not one of the things compared",
    ],
  },
  {
    says: "chooses what happened from buttons",
    tests: [
      "a rep adds a report from the top bar on a phone: the company, its main contact, a call that reached him, one line",
      "opened from a project drawer, the report arrives with the company and the job already chosen",
      "a rep reads only his own reports; the manager reads everyone's and narrows them by person and outcome",
      "what Kladra recorded is its own region beside the written reports, never among them",
    ],
  },
  {
    says: "each with m² and a price per m², subtotalled apart from the panels",
    tests: [
      "a rep requests a quotation with two services, and the live totals are the ones SQL reads back",
      "a revision that changes a service's price names that change",
    ],
  },
  {
    says: "How often each rep relies on her is tracked",
    tests: [
      "the coordinator issues a quotation for Faisal from the quotations screen: it is his, it says she raised it, and he is told",
      "a dispatch she raises for nobody is hers, under Internal Sales",
      "a rep's dialogs ask nobody who the paper is for",
      "the action refuses a rep who names somebody else, and the coordinator who names somebody off the customer",
      "reliance is a word: a habit at a quarter of the paper and at least three, occasional short of that, never at none",
      "the pure twin counts each person's paper in the window and the part somebody else raised",
      "the reader's statement counts what SQL written here counts, in every window",
    ],
  },
  {
    says: "Credit and tasaheel are one payment option",
    tests: [
      "payment is three choices with nothing written in the boxes, and credit without the terms is refused at the field",
      "credit is refused until the rep says what was agreed, and the desk reads it",
    ],
  },
  {
    says: "plus a Leads module",
    tests: [
      // "Marketing is a rep in everything": the rule, then the screens.
      "marketing is a rep in everything: it owns companies, prices them, and carries a month",
      "marketing is a rep in everything: its day carries a month, its rail the chain, and its own customer a price",
      "marketing requests a quotation and raises a dispatch on its own customer, and the metres count on its day",
      "marketing's recorded lane carries the load it raised, as a rep's does, and the manager reads the same lane",
      // "Plus a Leads module": the rep receives it apart and acknowledges it,
      // the manager sees it at two working days and reassigns it, and
      // marketing sees what became of each one.
      "marketing files a lead with a phone and the customer's query as its one note, and the rep acknowledges it from the band above his companies",
      "a lead nobody has acknowledged in two working days is on the manager's leads view, and he reassigns it to a rep who is told",
      "marketing's leads screen says what became of each lead it passed, as the company's own records say",
    ],
  },
  {
    says: "a slice or a bar opens the list behind it",
    tests: [
      "a slice or a bar carries the figure its SQL counts, and pressing it opens a list of exactly that many",
    ],
  },
  {
    says: "it moves out of Metrics",
    tests: [
      "the month is the first thing on the work tab, the company's for the manager and his own for a rep, and it has left Metrics",
    ],
  },
  {
    says: "Targets are the current month only",
    tests: [
      "the admin's targets are this month's: no month to move to, and a box saves to this month",
      "the earlier months are read, not set: newest first, a dash where a person had none, nothing to press",
      "a target for a month that is not this one is refused, however the form got there",
    ],
  },
  {
    says: "is the first and default view",
    tests: [
      "companies, quotations and dispatches each open on All, with All the first chip",
      "a fresh visit after choosing a status still opens on All",
    ],
  },
  {
    says: "Its columns come from the project's real life",
    tests: [
      "the projects board puts every project in the column its own papers decide, and a card opens its drawer",
      "lost beats every other fact, and every stage is reachable",
    ],
  },
  {
    says: "horizontal scrollbar is visible without scrolling down",
    tests: [
      "a board's scrollbar is on screen before any vertical scroll, and scrolling it moves the board",
      "a table wider than its card has its scrollbar on screen, and it stops under the top bar as the list scrolls",
    ],
  },
  {
    says: "for the item table plus the services section",
    tests: [
      "the request dialog stands at its stated width on a desk, and lines and services do not move it",
    ],
  },
  {
    says: "carry no hidden placeholder text",
    tests: [
      "payment is three choices with nothing written in the boxes, and credit without the terms is refused at the field",
    ],
  },
  {
    says: "pending quotations and pending dispatches side by side",
    tests: ["her two lists sit side by side at 1366 and one above the other at 375"],
  },
  {
    says: "the customer's query as the single note",
    tests: [
      "marketing files a lead with a phone and the customer's query as its one note, and the rep acknowledges it from the band above his companies",
    ],
  },
  {
    says: "Dropdowns must open in Microsoft Edge",
    tests: [
      // tests/edge.spec.ts, the `edge` project's one spec (D172): every kind of
      // popup on each role's screens, by click and by keyboard, in both locales.
      "every popup on Faisal's screens opens in Edge by click and by keyboard, and takes a choice",
      "every popup on Rawan's screens opens in Edge by click and by keyboard, and takes a choice",
      "every popup on Abdulrahman's screens opens in Edge by click and by keyboard, and takes a choice",
      "every popup on Jerom's screens opens in Edge by click and by keyboard, and takes a choice",
      // The cause, fixed once in the shell: a page the browser would translate.
      "a page a browser would translate is marked not to be, and a Select given a new value on it still opens",
    ],
  },
  {
    says: "applied everywhere in one sweep",
    owed: "P13-S12",
  },

  /*
   * P14 — the third round of real use (2026-09-20). Each decision is owed to
   * the slice that builds it and is rewritten as tests the moment it lands, so
   * a run of the gate always says which of the ten are still words.
   */
  {
    says: "the document as a whole takes one warehouse normally and allows a second or a third",
    tests: [
      "a paper may be priced out of a second store, and it comes back saying both",
      "a load out of a store its paper did not name is flagged like a changed price",
      // The rule itself, on hand-built papers: one entry for the whole load,
      // and the same two stores in the other order are the same two stores.
      "a load out of a second store differs from the paper that named one",
      "a load out of another store altogether says both, the paper's and its own",
      "the same two stores in the other order are the same two stores",
    ],
  },
  {
    says: "whoever asks writes a mandatory reason, the request goes to the manager",
    owed: "14.8",
  },
  {
    says: "A rep ticks whether he believes the company is registered in SMAC",
    owed: "14.6",
  },
  {
    says: "Beside the target is a tick that lets a zero-target person share anyway",
    tests: [
      "a rep with no target this month raises the work, and it counts for nobody",
      "the tick beside the target puts a zero-target rep back among the answers",
    ],
  },
  {
    says: "appears in the manager's awaiting section the moment it is submitted",
    tests: [
      "a request is on the manager's awaiting list the morning it is raised",
      "the awaiting figure is the whole desk, and only the late part is red",
    ],
  },
  {
    says: "A marketing lead's source is Marketing, fixed, not chosen",
    tests: [
      "marketing files a lead with a phone and the customer's query as its one note, and the rep acknowledges it from the band above his companies",
      "a rep is not offered the Marketing lead source, and marketing is not asked",
    ],
  },
  {
    says: "thirty days off is one entry with its dates and its length",
    owed: "14.9",
  },
  {
    says: "A popup must scroll in Microsoft Edge",
    tests: ["a popup's list scrolls in Edge, and it is the only thing that scrolls"],
  },
  {
    says: "A board's horizontal scrollbar must not sit on the card titles",
    tests: ["the bar stands clear of the words and paints over what it passes"],
  },
  {
    says: "Each export carries the filters of the screen it came from",
    owed: "14.10",
  },
];
