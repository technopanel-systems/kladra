import { getTranslations } from "next-intl/server";
import { formatSqmWhole } from "@/lib/money";
import { CHAIN_WINDOW_DAYS } from "@/lib/chain";
import { Sqm } from "@/components/ui-ext/figures";
import { lossReasonLabel } from "@/lib/loss-reason";
import type { LossCohort } from "@/lib/losses";
import { TONE_BAR } from "@/lib/state-tone";

/**
 * Why we lose (D140), beside the card that says where quotations go (D62).
 *
 * The two answer one question in two halves: what became of the paper, and what
 * became of the work. Same quarter, deliberately — `CHAIN_WINDOW_DAYS` — because
 * two cards on one screen asking about two different windows is a reader having
 * to hold two figures with almost the same name (rules/words.md).
 *
 * Every bar is the same neutral tone and that is the point. A lost project is
 * finished, not late: red here would put an alarm on the one card that is for
 * thinking about rather than for working through, next to a stuck list that
 * genuinely is red. The meaning is in the order and the metres, and both are
 * printed as text — the bars are for the shape of it and are hidden from a
 * reader who cannot see them, exactly as on the chain and months cards.
 *
 * Square metres lead and the count follows: one tower lost on price and five
 * small jobs lost on colour are not the same quarter (DESIGN §6).
 */
export async function LossCard({ cohort }: { cohort: LossCohort }) {
  const t = await getTranslations();

  if (cohort.projects === 0) {
    return (
      <section className="card-face flex flex-col gap-2 p-4">
        <h2 className="text-sm font-medium text-muted-foreground">{t("team.lossTitle")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("team.lossEmpty", { days: CHAIN_WINDOW_DAYS })}
        </p>
      </section>
    );
  }

  return (
    <section className="card-face flex flex-col gap-4 p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium text-muted-foreground">{t("team.lossTitle")}</h2>
        <p className="text-sm text-pretty">
          {t("team.lossMeans", {
            projects: cohort.projects,
            days: CHAIN_WINDOW_DAYS,
            // Whole metres: a sum of estimates somebody typed as round
            // numbers has no decimals to show (P11E).
            sqm: formatSqmWhole(cohort.sqm),
          })}
        </p>
      </div>

      <ol className="flex flex-col gap-2">
        {cohort.rows.map((row) => (
          <li key={row.reason} data-reason={row.reason} className="flex flex-col gap-1">
            <span className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
              {/* The stored value is a code; this is the one reader for it. */}
              <span className="min-w-0">{lossReasonLabel(row.reason, t)}</span>
              <span className="flex items-baseline gap-2">
                <Sqm value={row.sqm} whole />
                <span className="text-xs text-muted-foreground">
                  {t("team.lossProjects", { projects: row.projects })}
                </span>
              </span>
            </span>

            <span aria-hidden="true" className="h-1.5 w-full rounded-full bg-surface-2">
              <span
                style={{ inlineSize: `${row.share}%` }}
                className={`block h-full rounded-full ${TONE_BAR.over}`}
              />
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
