/**
 * Who may read a rep's floor, and who may write on it. Two questions, two
 * answers, and they are not the same answer.
 *
 * A manager sees everyone's companies (S8) so that he can read the month
 * without asking anyone to assemble anything (S57). He does not work them: the
 * history of a company is the report (S27), and a report written partly by the
 * person reading it is not a report. WORKFLOW §3 already says his screen is
 * read-only, and the companies list already refuses to offer him Add company —
 * this is the same rule everywhere else.
 *
 * They were one function, `mayTouch`, and the name was the bug: every write
 * action asked "may he touch this?", got "yes, he is the manager", and let a
 * manager edit, log against and archive any rep's records. The drawer offered
 * him the buttons to do it with. Splitting the question in two is what makes
 * the difference impossible to forget again (D42).
 *
 * A manager who sells is not an exception: a company he found is his, his own
 * id is on it, and `mayWrite` says yes to it for exactly the reason it says no
 * to Faisal's.
 *
 * No database, no `server-only`, no Auth.js — the rule is arithmetic on a role
 * and two ids, and keeping it that way is what lets `tests/floor.spec.ts` call
 * it directly with every role in turn.
 */
import type { Role, SessionUser } from "@/lib/types";

/** Manager and admin see every rep's records; a rep sees only his own. */
export function seesAllRoles(role: Role): boolean {
  return role === "manager" || role === "admin";
}

/** May this person OPEN a record whose rep is `repId`? */
export function mayOpen(user: SessionUser, repId: string): boolean {
  return seesAllRoles(user.role) || repId === user.id;
}

/**
 * May this person WRITE on a floor whose rep is `repId`?
 *
 * Only its rep. Not the manager who can read it, not the admin who can restore
 * it from the archive, not the coordinator — her work is the quotation and
 * dispatch chain, which has its own gates by role.
 *
 * And not an admin looking through that rep's eyes (P8.8). Viewing is reading:
 * the effective user IS the rep, so every other check would say yes, and the
 * screens would offer buttons the server then refuses — which is exactly the
 * "no work a screen offers that the action would refuse" rule (DESIGN §5).
 * One line here takes the buttons off every drawer at once.
 */
export function mayWrite(user: SessionUser, repId: string): boolean {
  if (user.viewedBy) return false;
  return repId === user.id;
}

/**
 * Who carries a monthly m² target, and therefore a row of figures on the
 * manager's team table (S43, D44).
 *
 * The same sentence as `CARRIES_METRES` in src/lib/team.ts, said in TypeScript
 * for the screens that ask it. Marketing does not: it finds customers and hands
 * them on, and a target it can never meet would be a number that says the wrong
 * thing every month (P8.9).
 */
export function carriesMetres(role: Role): boolean {
  return role === "rep" || role === "manager";
}

/**
 * Who may put a price in front of a customer.
 *
 * Marketing owns companies and works them like a rep — logs, follow-ups,
 * projects — and stops there. Quoting is the sales conversation, and the person
 * who has it is the rep the lead was handed to (P8.9).
 */
export function sells(role: Role): boolean {
  return carriesMetres(role);
}

/** May this person raise a quotation or a dispatch on this floor? */
export function mayQuote(user: SessionUser, repId: string): boolean {
  return sells(user.role) && mayWrite(user, repId);
}

/**
 * Who has a floor of his own: companies with his name on them, and the work of
 * one — logging a call, setting a follow-up, adding a project.
 *
 * The manager is not here. He reads every floor and adds no company (S8,
 * WORKFLOW §3); a company reaches him by handover, and from then on his own id
 * is on it and `mayWrite` says yes for the same reason it says yes to Faisal.
 */
export function ownsCompanies(role: Role): boolean {
  return role === "rep" || role === "marketing";
}

/**
 * The same two sentences as role LISTS, for the action guards.
 *
 * A guard takes roles, not a predicate, and a hand-written list beside a
 * predicate is the drift that made `mayTouch` a bug (D42): the screen asked one
 * question and the action asked another. tests/floor.spec.ts holds these two to
 * their functions for every role, so adding a sixth role cannot silently miss
 * one of them.
 */
export const FLOOR_ROLES: Role[] = ["rep", "marketing"];
export const SELLING_ROLES: Role[] = ["rep", "manager"];

/**
 * On whose floor may a company SIT.
 *
 * Whoever owns companies or sells: a rep, marketing, and the manager, who adds
 * none himself but can be handed one. Not the coordinator — she has no floor
 * (D15) — and not the admin, whose account is the one that survives everybody.
 */
export function holdsFloor(role: Role): boolean {
  return ownsCompanies(role) || sells(role);
}

/**
 * May this person move a company to somebody else's floor?
 *
 * Its owner, so marketing can hand a lead to the rep who will price it — the
 * whole reason the role exists — and a rep can pass a customer on. And the
 * manager and the admin for anybody's, because assignment is the job: when
 * somebody leaves, his floor has to reach a living person, and until this
 * existed a deactivated account took its companies out of sight for good.
 *
 * This is not the exception to D42 it looks like. A manager still writes
 * nothing ON a floor — no log, no edit, no follow-up, no archive — and the
 * history of a company stays the report its rep wrote (S27). Who a customer
 * belongs to is a different question from what happened with him, and it is
 * the manager's to answer. Every handover is audit-logged with both names.
 */
export function mayHandOver(user: SessionUser, repId: string): boolean {
  if (user.viewedBy) return false;
  return repId === user.id || user.role === "manager" || user.role === "admin";
}

