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
 */
export function mayWrite(user: SessionUser, repId: string): boolean {
  return repId === user.id;
}
