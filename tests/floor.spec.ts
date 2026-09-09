import { test, expect } from "@playwright/test";
import {
  carriesMetres,
  FLOOR_ROLES,
  holdsFloor,
  issuesOwnQuotations,
  mayHandOver,
  mayOpen,
  mayQuote,
  mayShare,
  mayWrite,
  ownsCompanies,
  REPORTING_ROLES,
  seesAllRoles,
  SELLING_ROLES,
  sells,
  writesReports,
} from "@/lib/floor";
import type { Role, SessionUser } from "@/lib/types";
// mayWorkProject and mayKeepContacts live in visibility.ts, not floor.ts,
// because they ask a second question floor.ts does not have the vocabulary
// for — "or was he put on this one" — but they are built entirely on
// mayWrite underneath, and that is exactly what the tests below hold them to.
// visibility.ts imports "@/db" for the SQL half of the file this does not
// use; the pool it names opens on first use, never on import (src/db/index.ts),
// so pulling the module in here costs nothing and opens no connection.
import { mayKeepContacts, mayWorkProject } from "@/lib/visibility";

/**
 * Who may read a rep's floor and who may write on it (SPEC S8, D42).
 *
 * The only spec in this suite that is not a walk through a screen, and it earns
 * the exception: this rule has no appearance when it is wrong. A manager was
 * able to edit, log against and archive any rep's records for the whole of P3
 * to P5, and nothing on any screen said so — the buttons were there, they
 * worked, and the only way to notice was to read the guard.
 *
 * `src/lib/floor.ts` has no database and no Auth.js in it precisely so this can
 * ask the question directly, once per role, instead of hoping a screen happens
 * to expose it.
 */

const FAISAL = "faisal-id";
const SAAD = "saad-id";

function who(role: Role, id: string): SessionUser {
  return { id, name: role, email: `${role}@technopanel.com.sa`, role, locale: "en" };
}

const ROLES: Role[] = ["rep", "marketing", "coordinator", "manager", "admin"];

test("a manager and an admin see every floor; a rep and the coordinator see one", () => {
  expect(seesAllRoles("manager")).toBe(true);
  expect(seesAllRoles("admin")).toBe(true);
  expect(seesAllRoles("rep")).toBe(false);
  // She reads every quotation and every dispatch by role, and that is a
  // different question from a FLOOR: since SPEC §3 she has companies of her
  // own, and the ones she may open are hers, exactly like a rep's.
  expect(seesAllRoles("coordinator")).toBe(false);

  expect(mayOpen(who("manager", "manager-id"), FAISAL)).toBe(true);
  expect(mayOpen(who("admin", "admin-id"), FAISAL)).toBe(true);
  expect(mayOpen(who("rep", SAAD), FAISAL)).toBe(false);
  expect(mayOpen(who("coordinator", "rawan-id"), FAISAL)).toBe(false);
});

test("nobody writes on a floor that is not theirs, whatever their role", () => {
  for (const role of ROLES) {
    expect(mayWrite(who(role, SAAD), FAISAL), `${role} could write on Faisal's floor`).toBe(false);
  }
});

/**
 * Changed in P11A (D91), and the reason written here as the charter asks: this
 * used to expect TRUE for every role. An id on a company is not a floor — a rep
 * promoted to coordinator kept `rep_id = him` on every company he had, and the
 * old rule let him work them from a role that has no floor at all. Writing
 * needs both now: his id on the company, and a role a company can sit on.
 */
test("everybody with a floor writes on their own; a role with no floor writes nowhere", () => {
  for (const role of ROLES) {
    expect(mayWrite(who(role, FAISAL), FAISAL), `${role} on his own floor`).toBe(holdsFloor(role));
  }
});

/**
 * The pair that was one function. Seeing is not working: every role that reads
 * more than its own floor reads it without being able to change it.
 */
test("reading a floor never implies writing on it", () => {
  for (const role of ROLES) {
    const user = who(role, SAAD);
    if (mayWrite(user, FAISAL)) {
      throw new Error(`${role} may write on a floor that is not his`);
    }
    expect(mayOpen(user, FAISAL)).toBe(seesAllRoles(role));
  }
});

/**
 * The marketing role, which is defined entirely by what it may not do (D50).
 *
 * Every sentence about it is one of these three functions, and every screen and
 * every action guard asks one of them rather than naming a role — so this is
 * where the role actually exists.
 */
test("marketing owns companies, does not price them, and carries no month", () => {
  expect(ownsCompanies("marketing")).toBe(true);
  expect(ownsCompanies("rep")).toBe(true);
  // The manager adds none; one reaches him by handover (S8, D51).
  expect(ownsCompanies("manager")).toBe(false);
  // Hers since SPEC §3, which overrules D15 and S9: "she creates companies,
  // projects and quotations like a rep".
  expect(ownsCompanies("coordinator")).toBe(true);
  expect(ownsCompanies("admin")).toBe(false);

  expect(sells("marketing")).toBe(false);
  expect(sells("rep")).toBe(true);
  expect(sells("manager")).toBe(true);
  expect(sells("coordinator")).toBe(true);

  // No target, for the same reason: a role that never closes a sale would read
  // as a permanent shortfall every month (D44).
  expect(carriesMetres("marketing")).toBe(false);

  // Its own leads included: owning a company is not being allowed to price it.
  const marketing = who("marketing", "marketing-id");
  expect(mayWrite(marketing, "marketing-id")).toBe(true);
  expect(mayQuote(marketing, "marketing-id")).toBe(false);
  expect(mayQuote(who("rep", FAISAL), FAISAL)).toBe(true);
});

/**
 * The guards take role LISTS and the screens ask predicates. A list that has
 * drifted from its function is `mayTouch` again (D42): the screen offers the
 * work and the server refuses it, or worse, the other way round.
 */
test("the role lists say exactly what the rules say", () => {
  for (const role of ROLES) {
    expect(FLOOR_ROLES.includes(role), `FLOOR_ROLES disagrees about ${role}`).toBe(
      ownsCompanies(role),
    );
    expect(SELLING_ROLES.includes(role), `SELLING_ROLES disagrees about ${role}`).toBe(sells(role));
    expect(REPORTING_ROLES.includes(role), `REPORTING_ROLES disagrees about ${role}`).toBe(
      writesReports(role),
    );
  }
});

/**
 * Who files a daily report and who only reads it (D55, D56). The manager and the
 * admin read: a manager's day IS the team, and the habit this replaces was reps
 * writing a line for a manager to read in the evening.
 */
test("the three roles that face the work write a report; the two that read it do not", () => {
  expect(writesReports("rep")).toBe(true);
  expect(writesReports("marketing")).toBe(true);
  expect(writesReports("coordinator")).toBe(true);
  expect(writesReports("manager")).toBe(false);
  expect(writesReports("admin")).toBe(false);
});

test("a company can sit on a floor, or there is nobody to hand it to", () => {
  expect(holdsFloor("rep")).toBe(true);
  expect(holdsFloor("marketing")).toBe(true);
  // He adds none and can be given one — that is how a floor survives somebody
  // leaving (D51).
  expect(holdsFloor("manager")).toBe(true);
  // Hers since SPEC §3. It was false for the whole of P11, and the reason it
  // matters is `mayWrite`: a role with no floor writes nowhere, so until this
  // turned over she could create a company and then not log a call against it.
  expect(holdsFloor("coordinator")).toBe(true);
  expect(holdsFloor("admin")).toBe(false);
});

/**
 * Who puts their own paper out (SPEC §3, P12-5).
 *
 * Asked as its own question rather than off the role, because "does she run the
 * queue" and "does she need a queue at all" happen to have the same answer
 * today and are not the same question — which is the whole lesson of `mayTouch`
 * (D42). A rep asks and waits; she types the SMAC number as she raises it,
 * because there is nobody behind her to ask.
 */
test("only the coordinator issues her own quotations, and it is not a floor rule", () => {
  expect(issuesOwnQuotations("coordinator")).toBe(true);
  for (const role of ROLES) {
    if (role === "coordinator") continue;
    expect(issuesOwnQuotations(role), `${role} could issue their own paper`).toBe(false);
  }

  // And it says nothing about whose floor anything sits on: she issues her own
  // and still cannot write a line on Faisal's.
  expect(mayWrite(who("coordinator", "rawan-id"), FAISAL)).toBe(false);
  expect(mayQuote(who("coordinator", "rawan-id"), "rawan-id")).toBe(true);
});

test("who may move a company: the sales manager and the admin, and nobody else", () => {
  expect(mayHandOver(who("manager", "manager-id"))).toBe(true);
  expect(mayHandOver(who("admin", "admin-id"))).toBe(true);

  // Not its owner — SPEC §3 says so in the founder's own words and overrules
  // D51 — and not marketing, which is named in that sentence because handing a
  // lead on used to be the whole reason the role existed.
  expect(mayHandOver(who("rep", FAISAL))).toBe(false);
  expect(mayHandOver(who("marketing", "marketing-id"))).toBe(false);
  expect(mayHandOver(who("coordinator", "rawan-id"))).toBe(false);

  // Viewing is reading, here as everywhere (P8.8).
  const viewing = { ...who("admin", "admin-id"), viewedBy: { id: "x", name: "Jerom" } };
  expect(mayHandOver(viewing)).toBe(false);
});

/**
 * Who may put somebody else on a company or a project (SPEC §3, D147).
 *
 * Its owner, the manager, the admin — and deliberately asked beside
 * `mayHandOver`, because the two are easy to conflate and the difference is
 * the whole rule: a handover moves whose metres these are and is the manager's
 * alone (SPEC §3); a share does not, and takes nothing from the person who
 * grants it, so inviting help with his own customer stays his call.
 */
test("who may share a company or a project: its owner, the manager, the admin — and nobody viewing", () => {
  expect(mayShare(who("marketing", "marketing-id"), "marketing-id")).toBe(true);
  expect(mayShare(who("rep", FAISAL), FAISAL)).toBe(true);
  expect(mayShare(who("manager", "manager-id"), FAISAL)).toBe(true);
  expect(mayShare(who("admin", "admin-id"), FAISAL)).toBe(true);

  // Not a colleague's — hers included, now that she has customers of her own:
  // sharing is the owner's call about his own, and Faisal's is not hers.
  expect(mayShare(who("rep", SAAD), FAISAL)).toBe(false);
  expect(mayShare(who("coordinator", "rawan-id"), FAISAL)).toBe(false);
  expect(mayShare(who("coordinator", "rawan-id"), "rawan-id")).toBe(true);

  // Viewing is reading, here as everywhere (P8.8).
  const viewing = { ...who("admin", "admin-id"), viewedBy: { id: "x", name: "Jerom" } };
  expect(mayShare(viewing, FAISAL)).toBe(false);
});

/**
 * May this person WORK a project — log against it, report on it, raise a
 * quotation or a dispatch on it (SPEC §3, D147)?
 *
 * Its own rep, always. Somebody it was shared with — `onProject`, the share
 * row a caller already fetched — works it exactly when his ROLE holds a floor
 * to work it from, the same "an id is not a floor" rule `mayWrite` itself was
 * built for (P11A, D91): a coordinator put on a project by mistake would not
 * begin working it, because she has no floor for the work to land on.
 */
test("mayWorkProject: his own project always; a shared one only for a role that holds a floor", () => {
  for (const role of ROLES) {
    const user = who(role, SAAD);
    // Not his and not shared: reading the company this project sits under is
    // not being on the JOB (D147) — the company share carries less than this.
    expect(mayWorkProject(user, FAISAL, false), `${role}, not on Faisal's project`).toBe(false);
    // Put on it: he works it exactly when his role holds a floor at all.
    expect(mayWorkProject(user, FAISAL, true), `${role}, put on Faisal's project`).toBe(
      holdsFloor(role),
    );
  }

  // His own project, never shared, reduces to `mayWrite` through the same door.
  for (const role of ROLES) {
    const user = who(role, FAISAL);
    expect(mayWorkProject(user, FAISAL, false), `${role} on his own project`).toBe(holdsFloor(role));
  }

  // Viewing is reading even for a share that would otherwise say yes.
  const viewing = { ...who("admin", "admin-id"), viewedBy: { id: "x", name: "Jerom" } };
  expect(mayWorkProject(viewing, "admin-id", true)).toBe(false);
});

/**
 * May this person keep his own contacts on this company (SPEC §3, D147)?
 *
 * The same shape as `mayWorkProject`, for the one thing a COMPANY share
 * carries besides reading: its own rep always, and somebody it was shared
 * with exactly when his role holds a floor for the contact to sit on.
 */
test("mayKeepContacts: his own company always; a shared one only for a role that holds a floor", () => {
  for (const role of ROLES) {
    const user = who(role, SAAD);
    expect(mayKeepContacts(user, FAISAL, false), `${role}, not shared Faisal's company`).toBe(false);
    expect(mayKeepContacts(user, FAISAL, true), `${role}, shared Faisal's company`).toBe(
      holdsFloor(role),
    );
  }

  for (const role of ROLES) {
    const user = who(role, FAISAL);
    expect(mayKeepContacts(user, FAISAL, false), `${role} on his own company`).toBe(holdsFloor(role));
  }

  const viewing = { ...who("admin", "admin-id"), viewedBy: { id: "x", name: "Jerom" } };
  expect(mayKeepContacts(viewing, "admin-id", true)).toBe(false);
});
