/**
 * Working-day math, in one place. Friday and Saturday are the weekend. Company
 * holidays and a person's leave come from the non_working_days table (loaded by
 * the caller and passed in, so this module is pure and testable).
 *
 * The month pace line on Home is "working days elapsed ÷ working days in the
 * month". "Stuck" requests are those waiting more than N working days.
 */
import { addDays, type Day, diffDays, firstOfMonth, lastOfMonth, weekday } from "./dates";

export type NonWorking = { day: Day; userId: string | null };

export function isWeekend(day: Day): boolean {
  const w = weekday(day);
  return w === 5 || w === 6;
}

function offSet(nonWorking: NonWorking[], userId?: string): Set<Day> {
  const set = new Set<Day>();
  for (const n of nonWorking) {
    if (n.userId === null || (userId !== undefined && n.userId === userId)) set.add(n.day);
  }
  return set;
}

export function isWorkingDay(day: Day, nonWorking: NonWorking[] = [], userId?: string): boolean {
  if (isWeekend(day)) return false;
  return !offSet(nonWorking, userId).has(day);
}

/** Working days in [from, to] inclusive. */
export function countWorkingDays(
  from: Day,
  to: Day,
  nonWorking: NonWorking[] = [],
  userId?: string,
): number {
  if (diffDays(from, to) < 0) return 0;
  const off = offSet(nonWorking, userId);
  let n = 0;
  for (let d = from; diffDays(d, to) >= 0; d = addDays(d, 1)) {
    if (!isWeekend(d) && !off.has(d)) n++;
  }
  return n;
}

/** Working days strictly after `from` up to and including `to`. */
export function workingDaysBetween(
  from: Day,
  to: Day,
  nonWorking: NonWorking[] = [],
  userId?: string,
): number {
  if (diffDays(from, to) <= 0) return 0;
  return countWorkingDays(addDays(from, 1), to, nonWorking, userId);
}

/** The next working day on or after `day`. */
export function nextWorkingDay(day: Day, nonWorking: NonWorking[] = [], userId?: string): Day {
  let d = day;
  while (!isWorkingDay(d, nonWorking, userId)) d = addDays(d, 1);
  return d;
}

/** Month pace: elapsed working days (through today) over the month's total. */
export function monthPace(
  today: Day,
  nonWorking: NonWorking[] = [],
  userId?: string,
): { elapsed: number; total: number; ratio: number } {
  const start = firstOfMonth(today);
  const end = lastOfMonth(today);
  const total = countWorkingDays(start, end, nonWorking, userId);
  const elapsed = countWorkingDays(start, today, nonWorking, userId);
  return { elapsed, total, ratio: total === 0 ? 0 : elapsed / total };
}
