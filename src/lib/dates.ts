/**
 * Riyadh calendar helpers. Everything the app shows or compares as "a day" goes
 * through here. A day is an ISO string "YYYY-MM-DD" in Asia/Riyadh; an instant
 * is a Date. Never call `new Date().toISOString().slice(0, 10)` anywhere else —
 * that is the UTC day, one behind Riyadh until 03:00.
 */

import { sql, type SQL } from "drizzle-orm";

export const RIYADH = "Asia/Riyadh";

export type Day = string; // "2026-08-04"

const dayParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: RIYADH,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The Riyadh calendar day an instant falls on. */
export function dayOf(instant: Date): Day {
  return dayParts.format(instant); // en-CA gives YYYY-MM-DD
}

/** Today in Riyadh. `now` is injectable for tests. */
export function todayRiyadh(now: Date = new Date()): Day {
  return dayOf(now);
}

export function parseDay(day: Day): { y: number; m: number; d: number } {
  const [y, m, d] = day.split("-").map(Number);
  return { y, m, d };
}

/** Midnight UTC of the same calendar numbers — safe for day arithmetic. */
export function dayToUtc(day: Day): Date {
  const { y, m, d } = parseDay(day);
  return new Date(Date.UTC(y, m - 1, d));
}

export function utcToDay(dt: Date): Day {
  return dt.toISOString().slice(0, 10);
}

export function addDays(day: Day, n: number): Day {
  const dt = dayToUtc(day);
  dt.setUTCDate(dt.getUTCDate() + n);
  return utcToDay(dt);
}

/** Calendar days from a to b (b − a). Negative when b is before a. */
export function diffDays(a: Day, b: Day): number {
  return Math.round((dayToUtc(b).getTime() - dayToUtc(a).getTime()) / 86_400_000);
}

/** 0 = Sunday … 5 = Friday, 6 = Saturday. */
export function weekday(day: Day): number {
  return dayToUtc(day).getUTCDay();
}

export function firstOfMonth(day: Day): Day {
  return day.slice(0, 8) + "01";
}

export function lastOfMonth(day: Day): Day {
  const { y, m } = parseDay(day);
  return utcToDay(new Date(Date.UTC(y, m, 0)));
}

export function addMonths(day: Day, n: number): Day {
  const { y, m } = parseDay(day);
  return utcToDay(new Date(Date.UTC(y, m - 1 + n, 1)));
}

const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_AR = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

/** 04/Aug/2026 — the one date format, both locales, Western digits. */
export function formatDay(day: Day | null | undefined, locale: string = "en"): string {
  if (!day) return "—";
  const { y, m, d } = parseDay(day);
  const dd = String(d).padStart(2, "0");
  const mon = locale.startsWith("ar") ? MONTHS_AR[m - 1] : MONTHS_EN[m - 1];
  return `${dd}/${mon}/${y}`;
}

/** "Aug" / "أغسطس" — the month alone, for an axis that writes the year once. */
export function formatMonthName(day: Day, locale: string = "en"): string {
  const { m } = parseDay(day);
  return locale.startsWith("ar") ? MONTHS_AR[m - 1] : MONTHS_EN[m - 1];
}

/** "Aug 2026" / "أغسطس 2026" for month headings. */
export function formatMonth(day: Day, locale: string = "en"): string {
  return `${formatMonthName(day, locale)} ${parseDay(day).y}`;
}

/**
 * The Riyadh calendar day an instant fell on, as `YYYY-MM-DD` text.
 *
 * `to_char` rather than a bare cast: node-postgres turns a `date` back into a
 * JavaScript Date at the READER's midnight, which is the whole bug this avoids
 * (rules/data.md).
 *
 * It was written twice, identically, in `@/lib/quotations` and `@/lib/dispatches`
 * — and a third caller needing it (P12-7's leads) is the moment a private copy
 * becomes a shared one rather than a third. Everything else in this file is
 * pure arithmetic on a `Day`; this is the one SQL fragment, and it is here
 * because "which day is this instant" is the question this file answers.
 */
export function riyadhDay(column: SQL): SQL<string | null> {
  return sql`to_char((${column} at time zone 'Asia/Riyadh')::date, 'YYYY-MM-DD')`;
}
