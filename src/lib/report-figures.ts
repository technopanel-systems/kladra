/**
 * A day, turned into the figures a screen shows (SPEC D55, WORKFLOW §4).
 *
 * Pure — no database, no `server-only` — for two reasons. The screen's own card
 * and the team list want the same day in two densities, and a pure function is
 * the only way both get the same one; and `tests/report-figures.spec.ts` can ask
 * it directly, the way `tests/floor.spec.ts` asks the floor rule.
 *
 * The type it takes comes from `@/lib/reports`, which does touch the database.
 * A TYPE crosses that line and a value does not (rules/data.md), so this file
 * imports it with `import type` and nothing here drags `@/db` anywhere.
 */
import { toNumber } from "@/lib/money";
import type { DayWork } from "@/lib/reports";

export type Figure = {
  /** A key inside the `reports` namespace. */
  key: string;
  value: string | number;
  /** Square metres rather than a count — shown with its unit. */
  sqm?: boolean;
};

/**
 * Every figure of a day, in the order the work happens in.
 *
 * Zeroes included: on a person's own card a nought is a fact he is checking
 * against his memory before he writes his sentence, and a card that hid it
 * would be a card he could not check.
 */
export function figuresOf(work: DayWork): Figure[] {
  // Every key names the thing it counts, and the two cards share a key wherever
  // they mean the same thing: a dispatch the desk approved is the same event on
  // Rawan's card and on the floor's, so it is one word in both languages rather
  // than two that drift (rules/words.md).
  if (work.kind === "desk") {
    return [
      { key: "quotationsIssued", value: work.issued },
      { key: "sentBack", value: work.sentBack },
      { key: "dispatchesApproved", value: work.approved },
      { key: "dispatchesRefused", value: work.refused },
    ];
  }
  return [
    { key: "logged", value: work.logged },
    { key: "companies", value: work.companies },
    { key: "quotationRequests", value: work.quotationsRaised },
    { key: "sentBack", value: work.quotationsSentBack },
    { key: "answers", value: work.answersRecorded },
    { key: "dispatchRequests", value: work.dispatchesRaised },
    { key: "dispatchesApproved", value: work.dispatchesApproved },
    { key: "moved", value: work.sqmMoved, sqm: true },
  ];
}

/**
 * Only what actually happened.
 *
 * The team list is a floor in one scroll, and a row of eight figures per person
 * where five of them are nought is a screen nobody reads to the bottom.
 * What is left is the answer to "who moved" — and an empty line is the answer to
 * "who did not", which is the other half of the same question.
 */
export function whatMoved(work: DayWork): Figure[] {
  return figuresOf(work).filter((figure) => toNumber(figure.value) > 0);
}

/** Nothing at all was recorded against this person on this day. */
export function movedNothing(work: DayWork): boolean {
  return whatMoved(work).length === 0 && (work.kind === "desk" || work.callsMade === 0);
}
