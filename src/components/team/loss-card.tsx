import { getLocale, getTranslations } from "next-intl/server";
import { rankInk } from "@/components/metrics/colors";
import { SharePie, type PieSlice } from "@/components/metrics/share-pie";
import { formatDay } from "@/lib/dates";
import { formatSqmWhole, toNumber } from "@/lib/money";
import { lossReasonLabel } from "@/lib/loss-reason";
import type { LossCohort } from "@/lib/losses";
import { foldForPie, wholePercents } from "@/lib/slices";

/**
 * Why we lose (D140), beside the card that says where quotations go (D62) — a
 * pie since §3 P13.
 *
 * The two answer one question in two halves: what became of the paper, and what
 * became of the work. The same window, and neither card chooses it — it is
 * picked once for the whole tab and passed down (D154).
 *
 * Every project given up in the window was given up for one reason, so the
 * reasons are parts of one whole — the metres lost — and that is a share. Nine
 * reasons is more than a pie may carry, so the five largest are drawn and the
 * rest are one slice (DESIGN §1b), named for what it is and not "Other", which
 * is a reason of its own here.
 *
 * No colour for a reason: a lost project is finished, not late, and red here
 * would put an alarm on the one card that is for thinking about rather than for
 * working through. The slices step by size in one neutral ink, and the order,
 * the metres and the count are all printed as text.
 *
 * The slices open nothing yet. The list behind them is lost projects in a
 * window, and the projects list has no window or reason to narrow by; a slice
 * that opened every project would count a different set of rows than it says
 * (D117), which is worse than a slice that is only read.
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
        <h2 className="text-sm font-medium text-foreground">{t("team.lossTitle")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("team.lossEmpty", { from })}
        </p>
      </section>
    );
  }

  const cents = (sqm: string) => Math.round(toNumber(sqm) * 100);
  const folded = foldForPie(cohort.rows, (row) => toNumber(row.sqm));
  const parts = [
    ...folded.kept.map((row) => ({
      key: row.reason,
      // The stored value is a code; this is the one reader for it.
      label: lossReasonLabel(row.reason, t) ?? row.reason,
      value: toNumber(row.sqm),
      projects: row.projects,
      data: { "data-reason": row.reason } as Record<string, string>,
    })),
    ...(folded.rest.length > 0
      ? [
          {
            key: "rest",
            label: t("metrics.rest", { count: folded.rest.length }),
            value: folded.rest.reduce((sum, row) => sum + cents(row.sqm), 0) / 100,
            projects: folded.rest.reduce((sum, row) => sum + row.projects, 0),
            data: undefined,
          },
        ]
      : []),
  ];
  const shares = wholePercents(parts.map((part) => part.value));

  const slices: PieSlice[] = parts.map((part, index) => ({
    key: part.key,
    data: part.data,
    label: part.label,
    caption: t("team.lossProjects", { projects: part.projects }),
    figure: formatSqmWhole(part.value),
    unit: t("common.sqm"),
    share: shares[index],
    value: part.value,
    href: null,
    ink: rankInk(index),
  }));

  return (
    <section className="card-face flex flex-col gap-4 p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium text-foreground">{t("team.lossTitle")}</h2>
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

      <SharePie slices={slices} label={t("team.lossTitle")} />
    </section>
  );
}
