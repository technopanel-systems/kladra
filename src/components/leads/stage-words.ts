import type { LeadStage } from "@/lib/leads";

/**
 * How far a lead has got, in a word, literal so both locales are held to each.
 *
 * The stage is never stored: it is read off the company's own records every
 * time it is asked (`LEAD_STAGE` in src/lib/leads.ts), and this is the word the
 * badge on the leads table says for each answer. It moved out of that table
 * when the leads file was written (P14 14.10), because a file that is the
 * screen has to say the same word in its last column — and the shape the app
 * already had for this is a map beside the component, not a second copy inside
 * the builder (`src/components/quotations/status-words.ts`).
 */
export const STAGE_KEYS: Record<LeadStage, string> = {
  waiting: "leads.notAcknowledged",
  acknowledged: "leads.acknowledged",
  contacted: "leads.contacted",
  quoted: "leads.quoted",
  won: "leads.won",
};
