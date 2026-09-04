import { getTranslations } from "next-intl/server";
import type { Pace } from "@/lib/team";
import { formatSqmWhole, toNumber } from "@/lib/money";
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
          <span className="text-sm">
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
            className="h-2 w-full overflow-hidden rounded-full bg-surface-2"
          >
            <div
              className={cn("h-full rounded-full bg-(image:--brand-grad)")}
              style={{ inlineSize: `${filled}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground">
            {t("team.ofTarget", { percent })}
          </span>
        </div>
      )}
    </section>
  );
}
