import { getLocale, getTranslations } from "next-intl/server";
import { formatMonth, formatMonthName } from "@/lib/dates";
import { formatSqmWhole, toNumber } from "@/lib/money";
import { lastFinishedChange, type MonthFigure } from "@/lib/months";
import { paceTone, TONE_BAR, TONE_TEXT } from "@/lib/state-tone";
import { cn } from "@/lib/utils";

/** `Day` is `YYYY-MM-DD`; the year is the part before the first dash. */
function year(day: string): string {
  return day.slice(0, 4);
}

/**
 * The year is written on the first column and wherever it turns over, and the
 * slot is kept on every other column so the six bars keep one baseline.
 */
function showYear(months: MonthFigure[], index: number): boolean {
  const previous = months[index - 1];
  return !previous || year(previous.month) !== year(months[index].month);
}

/**
 * The months before this one (SPEC D61, Jerom's phase 9C).
 *
 * Kladra had no month but the current one, anywhere. "1,180 m² against 1,500"
 * is a fact with nothing to be measured against, and the question everybody
 * actually asks in the second week is not "how am I doing" but "am I doing
 * better or worse than last month". The Google Sheet could answer that, because
 * a sheet has rows above the one you are on.
 *
 * Six bars. The bar is the only chart in this app (CLAUDE.md) and this is still
 * one: no line, no smoothing, no average. Fourteen people on cladding cycles
 * have lumpy months — one tower approved on the 28th is half a target — so a
 * trend line would draw a shape the business does not have.
 *
 * Every month's figure is written above its own bar, so the numbers are readable
 * without measuring anything and the bars only carry the shape. That is also why
 * they need no `role="img"`: there is nothing in the picture that is not in the
 * text beside it.
 *
 * A finished month is coloured against its own target, the same three bands the
 * month card uses (D48). The current one is not: it is a fifth of the way in,
 * and painting a fifth of a target red on the third of the month is a screen
 * people stop opening.
 */
export async function MonthsCard({ months }: { months: MonthFigure[] }) {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);

  // A public prop boundary: `monthsBack` always returns six, and a heading
  // reading "the last 0 months" over an empty row is not the fallback anybody
  // wants if that ever changes.
  if (months.length === 0) return null;

  const current = months[months.length - 1]?.month;
  // One scale for all six, so the bars can be compared with each other — and it
  // includes the targets, so a month that missed badly looks like it did.
  const ceiling = Math.max(
    1,
    ...months.map((m) => Math.max(toNumber(m.achieved), toNumber(m.target))),
  );

  const change = lastFinishedChange(months);

  return (
    <section className="card-face flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-sm font-medium text-muted-foreground">
          {t("team.lastMonths", { count: months.length })}
        </h2>

        {/* The one sentence a row of bars is for. Last finished month against
            the one before it — not against this one, which is still being
            worked, and would read "down 60%" on the third of every month. */}
        {change ? (
          <p className="text-sm">
            {change.percent === null
              ? t("team.monthFirst", { month: formatMonth(change.last.month, locale) })
              : t(change.percent >= 0 ? "team.monthUp" : "team.monthDown", {
                  month: formatMonth(change.last.month, locale),
                  previous: formatMonth(change.previous.month, locale),
                  percent: Math.abs(change.percent),
                })}
          </p>
        ) : null}
      </div>

      <ol className="flex items-end gap-1.5 sm:gap-3">
        {months.map((month, index) => {
          const done = toNumber(month.achieved);
          const aimed = toNumber(month.target);
          const running = month.month === current;
          const tone = running ? null : paceTone(done, aimed, 1);
          // A floor of 2px, so a month with a little in it is a mark and not a
          // gap: nothing and almost-nothing are different facts.
          const height = done === 0 ? 0 : Math.max(2, Math.round((done / ceiling) * 72));

          return (
            <li
              key={month.month}
              data-month={month.month}
              className="flex min-w-0 flex-1 flex-col items-center gap-1"
            >
              <span
                data-slot="month-sqm"
                className={cn(
                  // `.num` is the figure face every other m² in the app wears;
                  // tabular-nums alone left the same quantity in two faces.
                  "num text-[0.6875rem] leading-tight font-medium",
                  done === 0 && "text-faint",
                  tone && TONE_TEXT[tone],
                )}
                dir="ltr"
              >
                {formatSqmWhole(month.achieved)}
              </span>

              <span className="relative flex h-[72px] w-full items-end justify-center">
                <span
                  aria-hidden="true"
                  style={{ blockSize: `${height}px` }}
                  className={cn(
                    "w-full max-w-10 rounded-t-sm",
                    // The month still being worked is grey: it is a fifth of
                    // the way in and has no verdict yet (D61).
                    tone === null ? "bg-foreground/40" : TONE_BAR[tone],
                  )}
                />
                {/* Where the target sat that month. Hidden from readers because
                    the sentence and the figures already carry it, and a dashed
                    rule announced six times is noise. */}
                {aimed > 0 ? (
                  <span
                    aria-hidden="true"
                    style={{ insetBlockEnd: `${Math.round((aimed / ceiling) * 72)}px` }}
                    className="absolute inset-x-0 border-t border-dashed border-foreground/25"
                  />
                ) : null}
              </span>

              {/* The name on one line and the year under it, and the year only
                  where it changes. "Sep 2026" in a column 47px wide truncated,
                  and truncated from the END: Arabic showed «سبتمبر 6…», which
                  reads as some other year rather than as a cut-off 2026. A label
                  that has to be cut is a label carrying something it does not
                  need — the year is the same for five of the six (D65). */}
              <span className="flex w-full flex-col items-center text-[0.6875rem] leading-tight text-muted-foreground">
                <span data-slot="month-label" className="w-full text-center">
                  {formatMonthName(month.month, locale)}
                </span>
                <span
                  dir="ltr"
                  aria-hidden={showYear(months, index) ? undefined : "true"}
                  className={cn("num text-faint", showYear(months, index) || "invisible")}
                >
                  {year(month.month)}
                </span>
              </span>
            </li>
          );
        })}
      </ol>

      <p className="text-xs text-muted-foreground">{t("team.monthsMeans")}</p>
    </section>
  );
}
