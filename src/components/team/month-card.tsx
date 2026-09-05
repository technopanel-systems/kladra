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
    <section className="card-face flex flex-col gap-3 p-4">
      <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>

      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <p className="flex flex-col">
          <span className="text-xs text-muted-foreground">{t("team.achieved")}</span>
          <span className="text-2xl font-semibold">
            <span dir="ltr" className="num" data-slot="figure-achieved">
              {formatSqmWhole(achieved)}
            </span>{" "}
            <span className="text-sm font-normal text-muted-foreground">{t("common.sqm")}</span>
          </span>
        </p>

        <p className="flex flex-col">
          <span className="text-xs text-muted-foreground">{t("team.target")}</span>
          <span className="text-2xl font-semibold">
            {target === null ? (
              <span className="text-sm font-normal text-muted-foreground">
                {t("team.noTarget")}
              </span>
            ) : (
              <>
                <span dir="ltr" className="num" data-slot="figure-target">
                  {formatSqmWhole(target)}
                </span>{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  {t("common.sqm")}
                </span>
              </>
            )}
          </span>
        </p>

        {/* Beside the figures, never folded into them (S46). In the first five
            working days the ratio is noise, so it says so instead (S49). */}
        <p className="flex flex-col">
          <span className="text-xs text-muted-foreground">{t("team.pace")}</span>
          <span className={cn("text-sm", tone && TONE_TEXT[tone])}>
            {pace.justStarted
              ? t("team.justStarted")
              : t("team.paceLine", { elapsed: pace.elapsed, total: pace.total })}
          </span>
        </p>
      </div>

      {percent === null ? null : (
        <div className="flex flex-col gap-1.5">
          <div
            role="img"
            aria-label={t("team.ofTarget", { percent })}
            className="relative h-2 w-full overflow-hidden rounded-full bg-surface-2"
          >
            <div
              className={cn(
                "h-full rounded-full",
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
            {t("team.ofTarget", { percent })}
          </span>
        </div>
      )}
    </section>
  );
}
