import { cn } from "@/lib/utils";
import { formatDay, type Day } from "@/lib/dates";

/**
 * A date on a screen. Every one of them, both locales.
 *
 * `formatDay` builds the string; this decides how it is laid out, and it is the
 * only thing that does. Thirteen call sites used to answer that question
 * separately — two of them set `dir="auto"`, two put the date in the mono
 * figure face, nine did nothing — so the same day could sit twice in one drawer
 * looking like two different conventions.
 *
 * `auto`, never `ltr`. A forced LTR run around 04/سبتمبر/2026 reorders it: the
 * year, following an Arabic letter, is read as an Arabic number and joins the
 * month's right-to-left run, so the date comes out 04/2026/سبتمبر. Left to
 * `auto` the whole date takes the month name's direction and reads the way its
 * own reader expects — day nearest the start of the line in both languages.
 *
 * Not `.num`: that face is for money and m² (DESIGN §"utilities"), and a mono
 * fallback does nothing for an Arabic month name but change its shape.
 *
 * No hooks and no "use client" — `locale` comes in as a prop, so this renders
 * on the server or in the browser without a boundary either way.
 */
export function DayText({
  day,
  locale,
  className,
}: {
  day: Day | null | undefined;
  locale: string;
  className?: string;
}) {
  return (
    <span dir="auto" data-slot="day" className={cn("whitespace-nowrap", className)}>
      {formatDay(day, locale)}
    </span>
  );
}
