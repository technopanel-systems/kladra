import type { QuotationStatus } from "@/lib/quotations";

/**
 * The six words of a quotation's life, literal so both locales are held to each.
 * The same word on the list's chip, the board's column, a row's badge, the drawer's
 * head and the company and project drawers' short list, so "Waiting" is one thing
 * on every screen (rules/words.md). The list and the mini list each had their own
 * copy of this map until S12.4, one of them typed loosely enough to take a word
 * that is not a status.
 */
export const STATUS_KEYS: Record<QuotationStatus, string> = {
  requested: "quotations.statusRequested",
  returned: "quotations.statusReturned",
  issued: "quotations.statusIssued",
  accepted: "quotations.statusAccepted",
  rejected: "quotations.statusRejected",
  cancelled: "quotations.statusCancelled",
};
