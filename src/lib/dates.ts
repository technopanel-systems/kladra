/**
 * Riyadh calendar helpers. Everything the app shows or compares as "a day" goes
 * through here. A day is an ISO string "YYYY-MM-DD" in Asia/Riyadh; an instant
 * is a Date. Never call `new Date().toISOString().slice(0, 10)` anywhere else —
 * that is the UTC day, one behind Riyadh until 03:00.
 */

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

/** "Aug 2026" / "أغسطس 2026" for month headings. */
export function formatMonth(day: Day, locale: string = "en"): string {
  const { y, m } = parseDay(day);
  const mon = locale.startsWith("ar") ? MONTHS_AR[m - 1] : MONTHS_EN[m - 1];
  return `${mon} ${y}`;
}

/** 04/Aug/2026 14:35 in Riyadh, for log entries and audit rows. */
export function formatInstant(instant: Date | null | undefined, locale: string = "en"): string {
  if (!instant) return "—";
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: RIYADH,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(instant);
  return `${formatDay(dayOf(instant), locale)} ${time}`;
}
