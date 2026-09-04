import { test, expect } from "@playwright/test";
import { mayOpen, mayWrite, seesAllRoles } from "@/lib/floor";
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

const ROLES: Role[] = ["rep", "coordinator", "manager", "admin"];

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
