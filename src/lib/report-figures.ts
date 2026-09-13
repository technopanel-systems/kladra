/**
 * What Kladra recorded on a person's day, turned into the figures its lane
 * shows (SPEC §3 P13: "the system's own events are shown alongside, clearly
 * marked, never mixed in").
 *
 * Nobody types any of this. Every figure is read out of a record the work
 * itself produced — a quotation raised, a dispatch approved — which is exactly
 * why it is not the report: the report is what the person wrote, and this is
 * the half a machine can know.
 *
 * Pure — no database, no `server-only` — so the screen and
 * `tests/figures.spec.ts` ask the same function, and a TYPE is all that crosses
 * from `@/lib/reports` (rules/data.md).
 */
import { toNumber } from "@/lib/money";

/** One person's recorded day. Counted by who the work counts for (D86, D148). */
export type Recorded = {
  /**
   * May raise a quotation or a dispatch. A role that cannot has nothing in this
   * lane to move, and six noughts it cannot change would read as a floor that
   * did nothing (D50, D97).
   */
  sells: boolean;
  quotationsRaised: number;
  quotationsSentBack: number;
  answersRecorded: number;
  dispatchesRaised: number;
  /**
   * Dispatches approved that day that he was CREDITED on — counted the same way
   * the metres beside it are (D86, D148), so the count and the m² can never
   * disagree about which dispatches they mean.
   */
  dispatchesApproved: number;
  /** The m² those approved dispatches moved for him (S41, S43). */
  sqmMoved: string;
};

export const NOTHING_RECORDED: Omit<Recorded, "sells"> = {
  quotationsRaised: 0,
  quotationsSentBack: 0,
  answersRecorded: 0,
  dispatchesRaised: 0,
  dispatchesApproved: 0,
  sqmMoved: "0",
};

export type Figure = {
  /** A key inside the `reports` namespace; the label is `<key>Label`. */
  key: string;
  value: string | number;
  /** Square metres rather than a count — shown with its unit. */
  sqm?: boolean;
};

/** Every figure of a recorded day, in the order the work happens in. */
export function figuresOf(recorded: Recorded): Figure[] {
  if (!recorded.sells) return [];
  return [
    { key: "quotationRequests", value: recorded.quotationsRaised },
    { key: "sentBack", value: recorded.quotationsSentBack },
    { key: "answers", value: recorded.answersRecorded },
    { key: "dispatchRequests", value: recorded.dispatchesRaised },
    { key: "dispatchesApproved", value: recorded.dispatchesApproved },
    { key: "moved", value: recorded.sqmMoved, sqm: true },
  ];
}

/**
 * Only what actually happened. A lane of six figures where five are nought is
 * a lane nobody reads; an empty one says "nothing recorded" in one line.
 */
export function whatMoved(recorded: Recorded): Figure[] {
  return figuresOf(recorded).filter((figure) => toNumber(figure.value) > 0);
}
