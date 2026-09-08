import { addMonths, firstOfMonth, todayRiyadh, type Day } from "@/lib/dates";

/**
 * The window a metric is measured over (D152).
 *
 * Three named ones and no date boxes. Two pickers on a phone is four taps
 * before a figure appears, and the questions on the metrics tab are not asked
 * about arbitrary spans: they are asked about the month, the quarter and the
 * year, which is how this business already talks about its own work.
 *
 * Pure — no database, no cookies — so `tests/ranges.spec.ts` asks it directly
 * with a fixed today (including one in January, where a quarter crosses a year)
 * and a client component can import the type.
 */
export const RANGES = ["month", "quarter", "year"] as const;

export type Range = (typeof RANGES)[number];

/**
 * The quarter, not the month.
 *
 * The one real decision in this file. A quotation raised on the 28th has not
 * had time to be answered, so "how much of the pipeline converts" read over a
 * single month measures the calendar rather than the market — it would print a
 * collapse on the first of every month and a recovery by the twentieth, and a
 * figure that does that stops being read.
 */
export const DEFAULT_RANGE: Range = "quarter";

export function parseRange(value: unknown): Range | null {
  return RANGES.includes(value as Range) ? (value as Range) : null;
}

/** One cookie for the whole tab: the window is not a per-screen preference. */
export const RANGE_COOKIE = "kladra-range";

/** The URL wins; the cookie is consulted only when the URL says nothing. */
export function rangeFor(fromUrl: unknown, fromCookie: unknown): Range {
  return parseRange(fromUrl) ?? parseRange(fromCookie) ?? DEFAULT_RANGE;
}

/**
 * The first Riyadh day the window includes. The last day is always today: a
 * window that ended yesterday would hide a dispatch approved this morning, and
 * the first question anybody asks of a figure is whether it is current.
 *
 * The quarter is the last three calendar months INCLUDING this one, not the
 * last ninety days, so it lines up with the six bars above it and with the way
 * a month is talked about. The year is this calendar year, for the same reason:
 * a target is set per month and totted up per year (S43).
 */
export function rangeStart(range: Range, today: Day = todayRiyadh()): Day {
  const month = firstOfMonth(today);
  if (range === "month") return month;
  if (range === "quarter") return firstOfMonth(addMonths(month, -2));
  return `${today.slice(0, 4)}-01-01`;
}
