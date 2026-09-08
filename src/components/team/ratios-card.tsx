import { getTranslations } from "next-intl/server";
import { ShareBars } from "@/components/ui-ext/share-bars";
import type { ChainRatios } from "@/lib/metrics";

/**
 * How the work narrows on its way through (SPEC §3, D152).
 *
 * The founder asked for quotations per project and dispatches per quotation. A
 * ratio is the shortest way to say it and the worst way to read it: "1.6" is a
 * number nobody can check, and it hides which of the two figures moved. So each
 * row is a share of a whole instead — eleven of the fourteen projects raised in
 * the window were quoted — with the fraction written beside the bar and the
 * totals underneath, so nothing has to be taken on trust from a division
 * somebody else did (D59).
 *
 * Each row is a population and what became of it, not a rate: of the projects
 * started in the window, how many were quoted; of the quotations raised in it,
 * how many went out. A project quoted four times counts once, or the card would
 * answer "how much paper do we produce" rather than "how much of the work turns
 * into paper" — and the two halves of a fraction have to be about the same
 * rows, which is the defect this was written with (`src/lib/metrics.ts`).
 */
export async function RatiosCard({ ratios }: { ratios: ChainRatios }) {
  const t = await getTranslations();

  const rows = [
    {
      key: "quoted",
      label: t("team.ratioQuoted"),
      part: ratios.quotedProjects,
      whole: ratios.projects,
    },
    {
      key: "dispatched",
      label: t("team.ratioDispatched"),
      part: ratios.dispatchedQuotations,
      whole: ratios.quotations,
    },
  ];

  const nothing = ratios.projects === 0 && ratios.quotations === 0;

  return (
    <section className="card-face flex flex-col gap-4 p-4">
      <h2 className="text-sm font-medium text-muted-foreground">{t("team.ratios")}</h2>

      {/* A window with nothing raised in it is the answer to the question, not
          a blank card (D127). */}
      {nothing ? (
        <p className="text-sm text-muted-foreground">{t("team.ratiosNone")}</p>
      ) : (
        <>
          <ShareBars
            rows={rows.map((row) => ({
              key: row.key,
              label: row.label,
              figure: (
                <span dir="ltr" className="num text-sm">
                  {t("common.percent", {
                    percent: row.whole === 0 ? 0 : Math.round((row.part / row.whole) * 100),
                  })}
                </span>
              ),
              support: t("team.ratioOf", { part: row.part, whole: row.whole }),
              share: row.whole === 0 ? 0 : (row.part / row.whole) * 100,
            }))}
          />

          <p className="text-xs text-muted-foreground">
            {t("team.ratiosMeans", {
              quotations: ratios.quotations,
              dispatches: ratios.dispatches,
            })}
          </p>
        </>
      )}
    </section>
  );
}
