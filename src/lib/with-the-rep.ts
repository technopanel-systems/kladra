/**
 * Whether a record is still the rep's to change (P12-10).
 *
 * Four states across the two chains and one meaning: a quotation he has asked
 * for and the desk has not answered, a quotation she sent back, a dispatch
 * waiting on her, and a dispatch she refused. In every one of them the work is
 * his and the record has moved nothing, so the same form that raised it opens
 * on it again.
 *
 * §2 S53 is why refusal belongs here beside send-back: "a decision that ends
 * someone's work, a request sent back or refused, a quotation rejected, reaches
 * them with its written reason" — sent back and refused are one kind of event in
 * the founder's own sentence. Until P12-10 a refused dispatch was the odd one
 * out, and the only way to answer it was to type the whole thing again, which is
 * how a form ends up filled in on WhatsApp instead (S54).
 *
 * One function rather than one per chain, because it is one rule: the two
 * status words differ and what they mean does not, and two functions is where
 * the two would drift apart. It was written out by hand in the quotation's
 * actions and again in its drawer before it was written down here.
 *
 * Pure — no database, no `server-only` — so the client components that draw the
 * buttons and the server actions that refuse the write ask the same question
 * (`tests/floor.spec.ts` asks it directly too).
 */
import type { DispatchStatus } from "@/lib/dispatches";
import type { QuotationStatus } from "@/lib/quotations";

export function withTheRep(status: QuotationStatus | DispatchStatus): boolean {
  return (
    status === "requested" || status === "returned" || status === "submitted" || status === "refused"
  );
}
