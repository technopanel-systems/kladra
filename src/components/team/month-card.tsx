import { getTranslations } from "next-intl/server";
import { formatSqmWhole, toNumber } from "@/lib/money";
import { paceTone, TONE_TEXT } from "@/lib/state-tone";
import type { Pace } from "@/lib/team";
import { cn } from "@/lib/utils";

/**
 * A month: what was aimed at, what has actually gone out, and how far through
 * the month it is (SPEC S43, S46).
 *
 * The two sit side by side and are never combined. Kladra does not score
 * anybody — "80% of target on 60% of the month" is a sentence a manager can
 * draw his own conclusion from; a single number would be Kladra drawing it for
 * him, which S46 forbids outright.
 *
 * A rep with no target shows all his real figures and says so where the target
 * would be (S45). No bar in that case either: a bar with no end is a shape
 * pretending to mean something.
 *
 * The bar is the only chart in the app (CLAUDE.md). Where achieved passes the
 * target it fills and stops — 140% is a number, not a longer bar.
 *
 * Two marks on it, added in P8: the fill is what has been done and the notch is
 * where the month has got to. That is still the two facts S46 asks for side by
 * side — there is no combined score anywhere — and the gap between them is the
 * only thing anybody can act on. The fill takes its colour from that gap, which
 * is Jerom's P8 ruling that colour should carry "ahead of target" (D48).
 *
 * The bar used to be painted with the brand gradient, which DESIGN §4 keeps for
 * the primary button and nothing else. A gradient on a measurement is
 * decoration; now the colour says something.
 */
export async function MonthCard({
  title,
  target,
  achieved,
  pace,
}: {
  title: string;
  target: string | null;
  achieved: string;
  pace: Pace;
}) {
  const t = await getTranslations();

  const aimed = toNumber(target);
  const done = toNumber(achieved);
  const percent = aimed > 0 ? Math.round((done / aimed) * 100) : null;
  const filled = percent === null ? 0 : Math.min(100, percent);
  // In the first five working days the ratio is noise (S49), so the bar is not
  // coloured by it either — it stays neutral until the month means something.
  const tone = pace.justStarted ? null : paceTone(done, aimed, pace.ratio);

  return (
    // `month-card` names it for the specs that hold it to the top of its tab
    // (SPEC §3 P13: "at the top of the first tab, always visible").
    <section data-slot="month-card" className="card-face flex flex-col gap-3 p-3 md:p-4">
      <h2 className="text-sm font-medium text-foreground">{title}</h2>

      {/*
        One primary figure, and the rest a step down (restyle, DESIGN §1): what
        has gone out is the figure the card is for, at the top of the scale;
        what was aimed at and where the month has got to are the two facts it
        is read against, beside it and never folded into it (S46). Two figures
        at 24px were two answers competing for one glance.

        Labels on one line and values on the next, each row aligned on its
        baseline, so a 24px figure and a 14.5px one sit on one line of type
        rather than one of them floating. The pace takes the rest of the width
        and wraps there: "The month has just started." is the longest thing on
        the card, and on a phone it is the one that gives way.
      */}
      <dl className="grid grid-flow-col grid-cols-[max-content_max-content_minmax(0,1fr)] grid-rows-[auto_auto] items-baseline gap-x-6 gap-y-0.5">
        <dt className="text-xs text-muted-foreground">{t("team.achieved")}</dt>
        <dd className="text-2xl leading-8 font-semibold">
          <span dir="ltr" className="num" data-slot="figure-achieved">
            {formatSqmWhole(achieved)}
          </span>{" "}
          <span className="text-sm font-normal text-muted-foreground">{t("common.sqm")}</span>
        </dd>

        <dt className="text-xs text-muted-foreground">{t("team.target")}</dt>
        <dd className="text-base font-medium">
          {target === null ? (
            <span className="text-sm font-normal text-muted-foreground">{t("team.noTarget")}</span>
          ) : (
            <>
              <span dir="ltr" className="num" data-slot="figure-target">
                {formatSqmWhole(target)}
              </span>{" "}
              <span className="text-xs font-normal text-muted-foreground">{t("common.sqm")}</span>
            </>
          )}
        </dd>

        {/* Beside the figures, never folded into them (S46). In the first five
            working days the ratio is noise, so it says so instead (S49). A
            pace behind the calendar keeps its tone: a pace is what a tone on a
            line of words is for. */}
        <dt className="text-xs text-muted-foreground">{t("team.pace")}</dt>
        <dd className={cn("text-sm text-pretty", tone && TONE_TEXT[tone])}>
          {pace.justStarted
            ? t("team.justStarted")
            : t("team.paceLine", { elapsed: pace.elapsed, total: pace.total })}
        </dd>
      </dl>

      {percent === null ? null : (
        <div className="flex flex-col gap-1.5">
          <div
            role="img"
            aria-label={t.markup("team.ofTarget", { percent, num: (chunks) => chunks })}
            className="relative h-2 w-full overflow-hidden rounded-full bg-surface-2"
          >
            <div
              // At the charts' 0.7 (`toneInk`): the one bar on the card is a
              // mark on a chart, and poured at full strength it was louder
              // than the figure it draws.
              className={cn(
                "h-full rounded-full opacity-70",
                tone === "bad" && "bg-state-bad-fg",
                tone === "wait" && "bg-state-wait-fg",
                tone === "good" && "bg-state-good-fg",
                tone === null && "bg-foreground/40",
              )}
              style={{ inlineSize: `${filled}%` }}
            />
            {/* Where the month has got to. Hidden from readers because the
                sentence beside the bar already says it in words. */}
            {pace.justStarted ? null : (
              <span
                aria-hidden="true"
                className="absolute top-0 h-full w-0.5 bg-foreground/60"
                style={{ insetInlineStart: `${Math.round(pace.ratio * 100)}%` }}
              />
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            {t.rich("team.ofTarget", {
              percent,
              num: (chunks) => (
                <span dir="ltr" className="num">
                  {chunks}
                </span>
              ),
            })}
          </span>
        </div>
      )}
    </section>
  );
}
