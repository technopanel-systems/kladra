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
    owed: "P12-14 across — the tap that opens wa.me is walked at 375 and in the drawer, but nothing in the app binds a long press or a secondary press, so the number itself can never be revealed.",
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
      "the URL wins, the cookie remembers, and the list is the default",
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
      "marketing works its floor and is offered no price anywhere",
      "the role lists say exactly what the rules say",
    ],
  },
  {
    says: "the choice is remembered per person and carried in the URL",
    owed: "P12-14 across — the chosen view is kept in a cookie (src/lib/view.ts), so it is remembered per browser: the rep who chose the board at his desk gets the list back on his phone.",
  },
  {
    says: "between reps is the **sales manager's** action",
    tests: ["the sales manager moves a lead onto the floor that will price it"],
  },
  {
    says: "Marketing has its own module for bringing in a lead",
    tests: [
      // Filing IS the assignment: one Save and the customer is on the chosen
      // floor with somebody to ring on him (P12-7).
      "marketing files a lead and it is on the rep's floor when Save comes back",
      // And the assignment is answered, which is what clears it on all three
      // screens that count it.
      "the rep answers the lead, and the answer is what clears it everywhere",
      // The other half of the founder's sentence — "does not use the Add
      // company form" — asked of the rule rather than of a screen.
      "marketing files leads and adds no company; everybody else with a floor does the opposite",
    ],
  },
  {
    says: "The Marketing lead source is not offered to a rep adding a company",
    tests: [
      "a rep is not offered the Marketing lead source, and marketing is",
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
    owed: "P12-14 across — a new quotation line still copies the sheet off the line above it and a repeat ask opens on the customer's last quotation (D74). The dispatch half is paid: P12-10 took the site, the terms and the shipment method off the dispatch before it, and the read behind them with it.",
  },
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
];
