/**
 * What the Reports screen is looking at, and the arithmetic of its calendar
 * (SPEC §3 P13, 13.8).
 *
 * Everything the screen is showing is in its address — whose reports, which
 * day or month, which week, and the three filters — so a manager can send a
 * rep "your Tuesday" as a link and a refresh lands on the same screen (D145).
 * This file reads that address and writes it back, and it is the only place
 * that does: a chip, a calendar cell, a week column and a person all build their
 * link through `reportsHref`, so pressing one never drops the filter another
 * one set.
 *
 * Pure — no database, no `server-only` — so a client component can build a link
 * with it and `tests/reports.spec.ts` can ask the rule for "nothing written yet"
 * on a day it chooses rather than on the day the suite happens to run
 * (rules/data.md: a rule whose screen only exists on a working day cannot be
 * proved by walking the screen).
 */
import { addDays, firstOfMonth, lastOfMonth, weekday, type Day } from "@/lib/dates";
import { isWorkingDay, type NonWorking } from "@/lib/workdays";
import { isId } from "@/lib/id";

/** The manager reads the team by day or by week (SPEC §3, 13.8). */
export const PERIODS = ["day", "week"] as const;
export type Period = (typeof PERIODS)[number];
export const DEFAULT_PERIOD: Period = "day";

export function parsePeriod(value: unknown): Period | null {
  return PERIODS.includes(value as Period) ? (value as Period) : null;
}

/** The URL wins; the memory is consulted only when the URL says nothing (D164). */
export function periodFor(fromUrl: unknown, remembered: unknown): Period {
  return parsePeriod(fromUrl) ?? parsePeriod(remembered) ?? DEFAULT_PERIOD;
}

/** Everything in the address, already checked. Absent is null, never "". */
export type ReportQuery = {
  /** Whose reports, when the manager has pressed a person. */
  person: string | null;
  /** The day read, or the day the calendar narrowed to. */
  day: Day | null;
  /** The month the calendar shows, as its first day. */
  month: Day | null;
  period: Period | null;
  company: string | null;
  kind: string | null;
  outcome: number | null;
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;

function isRealDay(value: string): boolean {
  if (!DAY.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * The address, read. Anything unreadable is simply absent: a garbled `?day=` is
 * not an error page, it is the screen with nothing narrowed (S8: no telling-off).
 * A day after today is absent too — nothing has been written about it yet.
 *
 * `kinds` is the list a `?kind=` must be one of, handed in by the server page
 * from the column's own list so this file keeps no copy of it (rules/words.md).
 */
export function parseReportQuery(
  raw: Record<string, string | string[] | undefined>,
  today: Day,
  kinds: readonly string[],
): ReportQuery {
  const person = one(raw.person);
  const day = one(raw.day);
  const month = one(raw.month);
  const company = one(raw.company);
  const kind = one(raw.kind);
  const outcome = one(raw.outcome);
  const monthDay = month && MONTH.test(month) ? `${month}-01` : null;
  return {
    person: isId(person) ? person : null,
    day: day && isRealDay(day) && day <= today ? day : null,
    month: monthDay && isRealDay(monthDay) && monthDay <= today ? monthDay : null,
    period: parsePeriod(one(raw.period)),
    company: isId(company) ? company : null,
    kind: kind && kinds.includes(kind) ? kind : null,
    outcome: outcome && /^\d{1,9}$/.test(outcome) ? Number(outcome) : null,
  };
}

/**
 * The screen's own address with some of it changed. `null` removes a value;
 * a key left out keeps the one already there.
 *
 * Choosing a day forgets the month (the day says which month), and choosing a
 * month forgets the day (the calendar has moved away from it) — unless both are
 * given, which nothing does.
 */
export function reportsHref(current: ReportQuery, patch: Partial<ReportQuery>): string {
  const next: ReportQuery = { ...current, ...patch };
  if (patch.day) next.month = null;
  if (patch.month) next.day = null;
  const params = new URLSearchParams();
  if (next.person) params.set("person", next.person);
  if (next.period) params.set("period", next.period);
  if (next.day) params.set("day", next.day);
  if (next.month) params.set("month", next.month.slice(0, 7));
  if (next.company) params.set("company", next.company);
  if (next.kind) params.set("kind", next.kind);
  if (next.outcome !== null) params.set("outcome", String(next.outcome));
  const query = params.toString();
  return query ? `/reports?${query}` : "/reports";
}

/** Whether any of the three filters is set — the difference between two empty sentences (D127). */
export function isFiltered(query: ReportQuery): boolean {
  return query.company !== null || query.kind !== null || query.outcome !== null;
}

/**
 * The week a day is in, Sunday to Saturday — the Saudi week, which starts on
 * Sunday and ends on the weekend (SPEC S47).
 */
export function weekOf(day: Day): Day[] {
  const start = addDays(day, -weekday(day));
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** One cell of the month's calendar: a day, or a blank before the first. */
export type CalendarCell = Day | null;

/**
 * The month as rows of seven, Sunday first, with blanks before the first day
 * and after the last so every row is whole.
 */
export function monthGrid(month: Day): CalendarCell[][] {
  const first = firstOfMonth(month);
  const last = lastOfMonth(month);
  const cells: CalendarCell[] = Array.from({ length: weekday(first) }, () => null);
  for (let d = first; d <= last; d = addDays(d, 1)) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: CalendarCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

/** Why a person owed nothing on a day, when they did not. */
export type OffReason = "weekend" | "holiday" | "leave";

/**
 * Whether this person owed a report on this day, and if not, why not (D57).
 *
 * A Friday, a Saturday and a company holiday are nobody's working day; a
 * person's own leave is his alone. Being away is not being silent.
 */
export function offReason(day: Day, nonWorking: readonly NonWorking[], userId: string): OffReason | null {
  if (isWorkingDay(day, [...nonWorking], userId)) return null;
  if (!isWorkingDay(day, [...nonWorking])) {
    return nonWorking.some((row) => row.userId === null && row.day === day) ? "holiday" : "weekend";
  }
  return "leave";
}

/**
 * Who has written nothing on a day (SPEC §3, 13.8; D57).
 *
 * The people who write reports, minus the ones who wrote something, minus the
 * ones for whom it was not a working day — a weekend, a holiday, or their own
 * leave. On a day nobody works the answer is nobody, because nobody owed one.
 *
 * What the list MEANS depends on whether the day is over, and that is the
 * caller's sentence rather than this function's: today it is "nothing yet",
 * which is not a mark against anybody at ten in the morning, and only a finished
 * working day can hold a report that was missed.
 */
export function nothingWritten<P extends { id: string }>(
  people: readonly P[],
  wrote: ReadonlySet<string>,
  nonWorking: readonly NonWorking[],
  day: Day,
): P[] {
  return people.filter((person) => !wrote.has(person.id) && offReason(day, nonWorking, person.id) === null);
}
