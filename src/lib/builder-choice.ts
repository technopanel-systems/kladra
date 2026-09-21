/**
 * The report builder's four choices, and what they decide (SPEC §3 P13, 13.2;
 * WORKFLOW §0 G5 · S9).
 *
 * A manager's monthly questions are all one sentence with four blanks: HOW MUCH
 * of something, BROKEN DOWN by what, OVER which window, for WHOM. The builder is
 * those four blanks and nothing else, so every answer it gives is a figure an
 * existing card or list already counts, cut another way — never a new formula
 * (rules/data.md). Which reader each measure is, is `src/lib/builder.ts`.
 *
 * The choices live in the address (`?m=&by=&p=&rep=`), so a link is the
 * question: a manager sends "metres approved by rep, this month against last"
 * as an address, the way a window and a person already travel (D152).
 *
 * Pure — no database — so the controls in the browser, the page, the CSV route
 * and a spec all read the same lists, and a list is the source its type is
 * derived from (rules/words.md).
 */
import { addMonths, firstOfMonth, lastOfMonth, todayRiyadh, type Day } from "@/lib/dates";
import { parseRange, rangeStart, type Range } from "@/lib/ranges";
import { isId } from "@/lib/id";

/** How much of what. In the order the work happens, metres first. */
export const MEASURES = [
  "metres",
  "raised",
  "issued",
  "accepted",
  "approved",
  "reports",
  "leads",
] as const;
export type Measure = (typeof MEASURES)[number];

/** Broken down by. */
export const BREAKDOWNS = ["rep", "segment", "source", "city", "month"] as const;
export type Breakdown = (typeof BREAKDOWNS)[number];

/** Over which window: the tab's three (D152), and this month set against the last. */
export const PERIODS = ["month", "quarter", "year", "compare"] as const;
export type Period = (typeof PERIODS)[number];

export type Question = {
  measure: Measure;
  by: Breakdown;
  period: Period;
  /** The tab's picker: one person, or null for everybody. */
  repId: string | null;
};

type Params = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * The question in an address. Nothing chosen is the tab's own opening question
 * — the metres, by person, over the window the chips above already read —
 * because the first thing a manager asks of a month is who moved it.
 */
export function parseQuestion(params: Params, windowOfTab: Range): Question {
  const m = first(params.m);
  const by = first(params.by);
  const p = first(params.p);
  const rep = first(params.rep)?.trim();
  return {
    measure: MEASURES.includes(m as Measure) ? (m as Measure) : "metres",
    by: BREAKDOWNS.includes(by as Breakdown) ? (by as Breakdown) : "rep",
    period: PERIODS.includes(p as Period) ? (p as Period) : (parseRange(windowOfTab) ?? "quarter"),
    repId: isId(rep) ? rep : null,
  };
}

/** The address of a question, for the metrics tab or the CSV route. */
export function questionQuery(question: Question): string {
  const query = new URLSearchParams({ m: question.measure, by: question.by, p: question.period });
  if (question.repId) query.set("rep", question.repId);
  return query.toString();
}

/** One column of figures: a window of Riyadh days, both ends included. */
export type Column = { key: "value" | "this" | "last"; from: Day; to: Day };

/**
 * The windows a question is read over. One column for the three named windows,
 * up to today (D152); two for this month against the last — this month so far,
 * and the whole of the month before it. By month, "this against last" is simply
 * the two months as two rows of one column, because a month IS the breakdown.
 */
export function columnsFor(question: Pick<Question, "period" | "by">, today: Day = todayRiyadh()): Column[] {
  if (question.period !== "compare") {
    return [{ key: "value", from: rangeStart(question.period, today), to: today }];
  }
  const last = addMonths(firstOfMonth(today), -1);
  if (question.by === "month") return [{ key: "value", from: last, to: today }];
  return [
    { key: "this", from: firstOfMonth(today), to: today },
    { key: "last", from: last, to: lastOfMonth(last) },
  ];
}

/**
 * Which shape answers it (DESIGN §1b, SPEC §3 P13).
 *
 * - **By month** is a trend — columns along time.
 * - **This month against last** is a comparison of two windows — two bars a row.
 * - **By segment, source or city** says where a whole went or came from: every
 *   thing counted has exactly one of each, so the rows are parts of the total,
 *   and a share of a whole is a pie.
 * - **By person** compares people — bars, ranked. It is not drawn as a share
 *   even where the parts do add up: "who did more" is read along a row of bars,
 *   and a quotation two people share counts once for each of them (D148), so
 *   for four of the seven measures the people are not parts of one whole at all.
 */
export type Shape = "pie" | "rows" | "columns";

export function shapeFor(question: Pick<Question, "period" | "by">): Shape {
  if (question.by === "month") return "columns";
  if (question.period === "compare") return "rows";
  return question.by === "rep" ? "rows" : "pie";
}

/** Square metres, rather than a count of things. */
export function inMetres(measure: Measure): boolean {
  return measure === "metres";
}
