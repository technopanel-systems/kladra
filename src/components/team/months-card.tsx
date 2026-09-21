import { getLocale, getTranslations } from "next-intl/server";
import type { BarRow } from "@/components/metrics/bars-chart";
import { BarsChart } from "@/components/metrics/charts";
import { toneInk } from "@/components/metrics/colors";
import { formatMonth, formatMonthName, lastOfMonth } from "@/lib/dates";
import { formatSqmWhole, toNumber } from "@/lib/money";
import { lastFinishedChange, monthSentenceKey, type MonthFigure } from "@/lib/months";
import { narrowingQuery } from "@/lib/narrowing";
import { paceTone } from "@/lib/state-tone";

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
 * Six bars — a trend, which is a comparison along time, which is what a bar is
 * for (DESIGN §1b), drawn by the chart kit since §3 P13. No line, no smoothing,
 * no average: fourteen people on cladding cycles have lumpy months, and one
 * tower approved on the 28th is half a target, so a trend line would draw a
 * shape the business does not have.
 *
 * Every month's figure is written above its own bar and its name under it, so
 * the numbers are readable without measuring anything and the bars only carry
 * the shape. Each bar, and each figure, opens that month's approved dispatches
 * for whoever these metres are — the same window and person the bar counted
 * (D117, src/lib/counted.ts).
 *
 * A finished month is coloured against its own target, the same three bands the
 * month card uses (D48), with the target drawn across it as a dashed rule, so a
 * bar that fell short is visibly under its own line whether or not its colour is
 * legible. The current one is grey: it is a fifth of the way in, and painting a
 * fifth of a target red on the third of the month is a screen people stop
 * opening.
 */
export async function MonthsCard({
  months,
  personId,
}: {
  months: MonthFigure[];
  /** Whose metres — a rep's, or null for the company. */
  personId: string | null;
}) {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);

  // A public prop boundary: `monthsBack` always returns six, and a heading
  // reading "the last 0 months" over an empty row is not the fallback anybody
  // wants if that ever changes.
  if (months.length === 0) return null;

  const current = months[months.length - 1]?.month;
  const change = lastFinishedChange(months);

  /*
   * No history yet (S12.7): not a metre approved in any of the months, and no
   * target on any month before this one — a person in their first month, or a
   * floor that has not started. Six empty columns under six blank labels drew a
   * chart of nothing that looked like a chart that had failed to load, and its
   * sentence said "No metres in July or August" about months nobody was here
   * for. It says so once, in words, and where the chart starts from (D127).
   */
  const history = months.some(
    (month) =>
      toNumber(month.achieved) > 0 || (month.month !== current && toNumber(month.target) > 0),
  );
  if (!history) {
    return (
      <section data-slot="months-card" className="card-face flex flex-col gap-3 p-4">
        <h2 className="text-sm font-medium text-foreground">
          {t("team.lastMonths", { count: months.length })}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("team.monthsNone", { count: months.length })}
        </p>
      </section>
    );
  }

  const rows: BarRow[] = months.map((month, index) => {
    const done = toNumber(month.achieved);
    const aimed = toNumber(month.target);
    const running = month.month === current;
    const tone = running ? null : paceTone(done, aimed, 1);
    return {
      key: month.month,
      data: { "data-month": month.month },
      // The name on one line and the year under it, and the year only where it
      // changes. "Sep 2026" in a column 47px wide truncated, and truncated from
      // the END: Arabic showed «سبتمبر 6…», which reads as some other year
      // rather than as a cut-off 2026. A label that has to be cut is a label
      // carrying something it does not need (D65).
      label: formatMonthName(month.month, locale),
      sublabel: showYear(months, index) ? year(month.month) : null,
      values: [done],
      figures: [formatSqmWhole(month.achieved)],
      hrefs: [
        `/dispatches?${narrowingQuery({
          from: month.month,
          to: lastOfMonth(month.month),
          credited: personId,
        })}`,
      ],
      inks: [tone ? toneInk(tone) : { fill: "var(--text)", opacity: 0.4 }],
      target: aimed > 0 ? aimed : null,
    };
  });

  return (
    <section data-slot="months-card" className="card-face flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-sm font-medium text-foreground">
          {t("team.lastMonths", { count: months.length })}
        </h2>

        {/* The one sentence a row of bars is for. Last finished month against
            the one before it — not against this one, which is still being
            worked, and would read "down 60%" on the third of every month. */}
        {change ? (
          <p className="text-sm">
            {change.kind === "percent" && change.percent !== null
              ? t(monthSentenceKey(change.percent), {
                  month: formatMonth(change.last.month, locale),
                  previous: formatMonth(change.previous.month, locale),
                  percent: Math.abs(change.percent),
                })
              : t(
                  change.kind === "first"
                    ? "team.monthFirst"
                    : change.kind === "afterEmpty"
                      ? "team.monthAfterEmpty"
                      : "team.monthNothing",
                  {
                    month: formatMonth(change.last.month, locale),
                    previous: formatMonth(change.previous.month, locale),
                  },
                )}
          </p>
        ) : null}
      </div>

      <BarsChart
        orientation="columns"
        rows={rows}
        series={[{ key: "achieved", label: t("team.achieved"), ink: toneInk("over") }]}
        label={t("team.lastMonths", { count: months.length })}
      />

      <p className="text-xs text-muted-foreground">{t("team.monthsMeans")}</p>
    </section>
  );
}
