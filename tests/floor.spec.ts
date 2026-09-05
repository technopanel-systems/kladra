import { test, expect } from "@playwright/test";
import {
  carriesMetres,
  FLOOR_ROLES,
  holdsFloor,
  mayHandOver,
  mayOpen,
  mayQuote,
  mayWrite,
  ownsCompanies,
  REPORTING_ROLES,
  seesAllRoles,
  SELLING_ROLES,
  sells,
  writesReports,
} from "@/lib/floor";
import type { Role, SessionUser } from "@/lib/types";

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
  // She has no companies of her own at all (D15, S9) — her work is the queue.
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

test("everybody writes on their own floor, including a manager who sells", () => {
  for (const role of ROLES) {
    expect(mayWrite(who(role, FAISAL), FAISAL), `${role} could not write on his own floor`).toBe(
      true,
    );
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
  expect(ownsCompanies("coordinator")).toBe(false);
  expect(ownsCompanies("admin")).toBe(false);

  expect(sells("marketing")).toBe(false);
  expect(sells("rep")).toBe(true);
  expect(sells("manager")).toBe(true);

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
  expect(holdsFloor("coordinator")).toBe(false);
  expect(holdsFloor("admin")).toBe(false);
});

test("who may move a company: its owner, the manager, the admin — and nobody viewing", () => {
  expect(mayHandOver(who("marketing", "marketing-id"), "marketing-id")).toBe(true);
  expect(mayHandOver(who("rep", FAISAL), FAISAL)).toBe(true);
  expect(mayHandOver(who("manager", "manager-id"), FAISAL)).toBe(true);
  expect(mayHandOver(who("admin", "admin-id"), FAISAL)).toBe(true);

  // Not a colleague's, and not the coordinator's business at all.
  expect(mayHandOver(who("rep", SAAD), FAISAL)).toBe(false);
  expect(mayHandOver(who("coordinator", "rawan-id"), FAISAL)).toBe(false);

  // Viewing is reading, here as everywhere (P8.8).
  const viewing = { ...who("admin", "admin-id"), viewedBy: { id: "x", name: "Jerom" } };
  expect(mayHandOver(viewing, FAISAL)).toBe(false);
});
