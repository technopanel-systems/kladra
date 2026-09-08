import { getLocale, getTranslations } from "next-intl/server";
import { formatDay } from "@/lib/dates";
import { formatSqmWhole } from "@/lib/money";
import { Sqm } from "@/components/ui-ext/figures";
import { lossReasonLabel } from "@/lib/loss-reason";
import type { LossCohort } from "@/lib/losses";
import { ShareBars } from "@/components/ui-ext/share-bars";

/**
 * Why we lose (D140), beside the card that says where quotations go (D62).
 *
 * The two answer one question in two halves: what became of the paper, and what
 * became of the work. The same window, and neither card chooses it — it is
 * picked once for the whole tab and passed down (D154), because two cards on
 * one screen asking about two different windows is a reader having to hold two
 * figures with almost the same name (rules/words.md).
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
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  const from = formatDay(cohort.from, locale);

  if (cohort.projects === 0) {
    return (
      <section className="card-face flex flex-col gap-2 p-4">
        <h2 className="text-sm font-medium text-muted-foreground">{t("team.lossTitle")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("team.lossEmpty", { from })}
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
            from,
            // Whole metres: a sum of estimates somebody typed as round
            // numbers has no decimals to show (P11E).
            sqm: formatSqmWhole(cohort.sqm),
          })}
        </p>
      </div>

      <ShareBars
        rows={cohort.rows.map((row) => ({
          key: row.reason,
          data: { "data-reason": row.reason },
          share: row.share,
          // The stored value is a code; this is the one reader for it.
          label: lossReasonLabel(row.reason, t),
          figure: <Sqm value={row.sqm} whole />,
          support: t("team.lossProjects", { projects: row.projects }),
        }))}
      />

    </section>
  );
}
