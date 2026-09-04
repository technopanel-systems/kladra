/**
 * What colour a thing is, and the only place that decides (DESIGN §6).
 *
 * Colour carried no meaning in Kladra until P8: status was a word, and the
 * three or four places that did tint a row each picked their own. Jerom asked
 * for meaning — state, overdue, stuck, ahead of target — from one small set
 * used the same way everywhere. Five tones, two axes, one table:
 *
 * - `wait`   amber   somebody owes an answer, or it is due today
 * - `open`   blue    out in the world, nothing owed today
 * - `good`   green   it went the right way
 * - `bad`    red     it went the wrong way, or it is late
 * - `over`   neutral finished, and no longer interesting
 *
 * Colour never carries a meaning on its own: everything tinted here also says
 * its word, because a rep with deuteranopia reads the same screen (and so does
 * anybody looking at a phone in Riyadh sunlight).
 *
 * Pure functions, no database, no `server-only` — `tests/state-tone.spec.ts`
 * asks them directly, the way `tests/floor.spec.ts` asks the floor rule.
 */
import type { DispatchStatus } from "@/lib/dispatches";
import type { FollowUpState } from "@/lib/followups";
import type { QuotationStatus } from "@/lib/quotations";

export type StateTone = "wait" | "open" | "good" | "bad" | "over";

/** The tint and its text, as Tailwind classes. */
export const TONE_CLASS: Record<StateTone, string> = {
  wait: "bg-state-wait text-state-wait-fg",
  open: "bg-state-open text-state-open-fg",
  good: "bg-state-good text-state-good-fg",
  bad: "bg-state-bad text-state-bad-fg",
  over: "bg-state-over text-state-over-fg",
};

/** Just the text colour, for a figure or a line that carries no pill. */
export const TONE_TEXT: Record<StateTone, string> = {
  wait: "text-state-wait-fg",
  open: "text-state-open-fg",
  good: "text-state-good-fg",
  bad: "text-state-bad-fg",
  over: "text-state-over-fg",
};

/**
 * A quotation's tone.
 *
 * `requested` and `returned` are both amber and that is deliberate: they are
 * two different people owing the answer — the coordinator on one, the rep on
 * the other — and from the screen's point of view they are the same fact, that
 * this one is not moving by itself. `rejected` is red because the customer said
 * no and somebody has to decide what happens next; `cancelled` is grey because
 * the rep took his own request back and nothing happened at all (D32).
 */
export function quotationTone(status: QuotationStatus): StateTone {
  switch (status) {
    case "requested":
    case "returned":
      return "wait";
    case "issued":
      return "open";
    case "accepted":
      return "good";
    case "rejected":
      return "bad";
    case "cancelled":
      return "over";
  }
}

/** A dispatch's tone. Approved is the only event that counts a month (S41). */
export function dispatchTone(status: DispatchStatus): StateTone {
  switch (status) {
    case "submitted":
      return "wait";
    case "approved":
      return "good";
    case "refused":
      return "bad";
  }
}

/**
 * A follow-up's tone. Due today is due, not overdue (S50), so it is amber and
 * not red; a date in the future is nobody's problem today and gets no colour
 * at all, which is what `null` means here.
 */
export function followUpTone(state: FollowUpState | null): StateTone | null {
  if (state === "overdue") return "bad";
  if (state === "today") return "wait";
  return null;
}

/**
 * The text class for a follow-up date read against today.
 *
 * Three screens compared the same two Riyadh days and each wrote its own
 * ladder of class names. A date in the future is nobody's problem today, so it
 * gets no colour at all — faint, like the rest of the row.
 */
export function followUpClass(day: string | null, today: string): string {
  if (!day) return "text-faint";
  const tone = followUpTone(day < today ? "overdue" : day === today ? "today" : "future");
  return tone ? TONE_TEXT[tone] : "text-faint";
}

/**
 * A month's tone, from how far through it somebody is against how far through
 * the working days are (S42).
 *
 * Ahead is green, a little behind is amber, and properly behind is red. The
 * band is deliberately wide: a rep who is four per cent short on the eighth of
 * the month has not gone wrong, and a screen that says he has stops being read.
 */
export function paceTone(achieved: number, target: number, elapsedShare: number): StateTone | null {
  if (target <= 0) return null;
  const done = achieved / target;
  const owed = elapsedShare;
  if (done >= owed) return "good";
  if (done >= owed - 0.15) return "wait";
  return "bad";
}
