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
 *
 * And a role that holds no floor (P11A, D91). An id on a company is not a
 * floor: a rep promoted to coordinator or admin kept `rep_id = him` on every
 * company he had, and this said yes to him for ever, from a role the drawer
 * offers no floor to. The admin cannot give such a role to somebody who still
 * has companies — they are handed over first (`updateUserAction`) — and this
 * is the check behind that door for the ones that slip through.
 */
export function mayWrite(user: SessionUser, repId: string): boolean {
  if (user.viewedBy) return false;
  return holdsFloor(user.role) && repId === user.id;
}

/**
 * Who carries a monthly m² target, and therefore a row of figures on the
 * manager's team table (S43, D44).
 *
 * `CARRIES_METRES` in src/lib/team.ts is this function, filtered over `ROLES`
 * and handed to the query — one sentence, not two, since a hand-written role
 * list beside a predicate is what D42 was. Marketing does not: it finds customers and hands
 * them on, and a target it can never meet would be a number that says the wrong
 * thing every month (P8.9).
 *
 * The coordinator does, since SPEC §3 — the founder's own words: she is "a
 * selling role too: department Internal Sales, her own m² target", which
 * overrules D15 and S9's "she does not own customer relationships". She was
 * the one person in the building selling without a number against her name.
 */
export function carriesMetres(role: Role): boolean {
  return role === "rep" || role === "manager" || role === "coordinator";
}

/**
 * Who may put a price in front of a customer.
 *
 * Marketing owns companies and works them like a rep — logs, follow-ups,
 * projects — and stops there. Quoting is the sales conversation, and the person
 * who has it is the rep the lead was handed to (P8.9). The coordinator has that
 * conversation too now (SPEC §3), and hers ends differently: she does not ask
 * the desk for a price, because she IS the desk — see `issuesOwnQuotations`.
 */
export function sells(role: Role): boolean {
  return carriesMetres(role);
}

/**
 * Who puts the paper out themselves instead of asking for it (SPEC §3).
 *
 * The coordinator, and only her. A rep raises a request and waits; she types
 * the SMAC number and the quotation is issued in one act, because there is
 * nobody behind her to ask. That is the whole reason the record is marked: "so
 * nobody issues their own work unseen" is the founder's own clause, and what it
 * asks for is not a refusal but a name on a list the manager reads.
 */
export function issuesOwnQuotations(role: Role): boolean {
  return role === "coordinator";
}

/**
 * Who brings a customer in through the lead module instead of Add company
 * (SPEC §3, P12-7).
 *
 * "Marketing does not use the Add company form. Marketing has its own module
 * for bringing in a lead, and creating one there IS an assignment: it goes to a
 * chosen rep, or to a member of the marketing team."
 *
 * Marketing, and only marketing. The manager reads every lead and files none,
 * for the reason he adds no company (S8): a customer belongs to whoever found
 * him, and a row the manager typed onto a rep's floor would put his own reading
 * of a phone call into somebody else's report.
 *
 * It stays a role question rather than a screen question because the two are
 * the same door: the form marketing is not offered is the action marketing must
 * be refused, and this is the sentence both of them ask.
 */
export function filesLeads(role: Role): boolean {
  return role === "marketing";
}

/**
 * Who fills in Add company.
 *
 * Everyone with a floor except the role §3 moved to the lead module. Written as
 * the subtraction rather than as a fresh list of two, because that is the whole
 * change: marketing did not stop owning companies — a lead lands on its floor
 * like anybody else's — it stopped being the one who types the customer in.
 */
export function addsCompanies(role: Role): boolean {
  return ownsCompanies(role) && !filesLeads(role);
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
 *
 * The coordinator is, since SPEC §3: "she creates companies, projects and
 * quotations like a rep". Her desk work is unchanged — she still issues
 * everybody's paper and approves everybody's dispatches — and this is the floor
 * beside it, which is why the two questions this file keeps apart matter more
 * than ever: she READS every quotation in the building by role, and WRITES only
 * on the companies that are hers.
 */
export function ownsCompanies(role: Role): boolean {
  return role === "rep" || role === "marketing" || role === "coordinator";
}

/**
 * Who writes a daily report, and therefore has a row on the day the team reads
 * (SPEC D55, D56).
 *
 * The people whose day is customer work: the reps, marketing and the
 * coordinator. The manager and the admin read it — a manager's day IS the team,
 * and a report he wrote about himself would be a report he also marks.
 *
 * It said `ownsCompanies(role) || role === "coordinator"` until SPEC §3 gave
 * her companies, and the second half is now what the first half says. Left in,
 * it would be a clause that can never be reached — the kind that survives a
 * rewrite and quietly answers for a role nobody meant.
 */
export function writesReports(role: Role): boolean {
  return ownsCompanies(role);
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
export const FLOOR_ROLES: Role[] = ["rep", "marketing", "coordinator"];
export const SELLING_ROLES: Role[] = ["rep", "manager", "coordinator"];
export const REPORTING_ROLES: Role[] = ["rep", "marketing", "coordinator"];
export const ADD_COMPANY_ROLES: Role[] = ["rep", "coordinator"];
export const LEAD_ROLES: Role[] = ["marketing"];

/**
 * On whose floor may a company SIT.
 *
 * Whoever owns companies or sells: a rep, marketing, the coordinator since §3,
 * and the manager, who adds none himself but can be handed one. Not the admin,
 * whose account is the one that survives everybody.
 */
export function holdsFloor(role: Role): boolean {
  return ownsCompanies(role) || sells(role);
}

/**
 * May this person put somebody else on a company or a project of his?
 *
 * Its owner, because inviting help with his own customer is his call, and the
 * manager and the admin for anybody's. Deliberately not the same answer as
 * handing over (D147): a handover changes whose metres these are and belongs to
 * the sales manager alone (SPEC §3), while a share changes who else can see and
 * work, and takes nothing from the person who grants it.
 */
export function mayShare(user: SessionUser, ownerId: string): boolean {
  if (user.viewedBy) return false;
  return ownerId === user.id || user.role === "manager" || user.role === "admin";
}

/**
 * May this person move a company to somebody else's floor?
 *
 * The sales manager, and the admin behind him. Nobody else — not its owner
 * (SPEC §3, which overrules D51), and not marketing, which is named in that
 * sentence because handing a lead on used to be the whole reason the role
 * existed. Assignment is the manager's job in two directions: a customer moved
 * from one rep to another is a decision about whose metres these will be, and
 * when somebody leaves, his floor has to reach a living person — until this
 * existed a deactivated account took its companies out of sight for good.
 *
 * Marketing loses nothing it will keep: §3 replaces the Add-company-then-hand-
 * over path with a lead module where creating a lead IS the assignment, so the
 * role stops owning companies rather than stops being able to give them away.
 * That module is P12's box 7; between it and here, marketing hands a lead on by
 * asking the manager, which is what it did before Kladra existed.
 *
 * This is not the exception to D42 it looks like. A manager still writes
 * nothing ON a floor — no log, no edit, no follow-up, no archive — and the
 * history of a company stays the report its rep wrote (S27). Who a customer
 * belongs to is a different question from what happened with him, and it is
 * the manager's to answer. Every handover is audit-logged with both names.
 *
 * It takes no company, because the answer no longer depends on one. It used to,
 * and the argument every caller was passing is what made "the owner may too"
 * easy to write and easy to keep; a permission with nothing to compare cannot
 * quietly grow an exception.
 */
export function mayHandOver(user: SessionUser): boolean {
  if (user.viewedBy) return false;
  return user.role === "manager" || user.role === "admin";
}

