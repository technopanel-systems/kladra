import type { DispatchStatus } from "@/lib/dispatches";

/**
 * The three words of a load's life, literal so both locales are held to each.
 * The same word on the list's chip, the board's column, a row's badge, the
 * drawer's head, the mini list on a company and the dispatches file, so
 * "Approved" is one thing wherever it is read (rules/words.md).
 *
 * The quotations' six were pulled into `status-words.ts` beside this one in
 * S12.4, for exactly this reason; these three stayed in two copies, and the
 * file the founder asked for in P14 14.10 would have made it three.
 */
export const STATUS_KEYS: Record<DispatchStatus, string> = {
  submitted: "dispatches.statusSubmitted",
  approved: "dispatches.statusApproved",
  refused: "dispatches.statusRefused",
};
