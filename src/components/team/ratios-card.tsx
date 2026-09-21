import { getTranslations } from "next-intl/server";
import { toneInk } from "@/components/metrics/colors";
import { ProgressRing } from "@/components/metrics/charts";
import type { Day } from "@/lib/dates";
import type { ChainRatios } from "@/lib/metrics";
import { narrowingQuery } from "@/lib/narrowing";

/**
 * How the work narrows on its way through (SPEC §3, D152) — two rings since §3
 * P13.
 *
 * The founder asked for quotations per project and dispatches per quotation. A
 * ratio is the shortest way to say it and the worst way to read it: "1.6" is a
 * number nobody can check, and it hides which of the two figures moved. So each
 * one is a population and how far it got — eleven of the fourteen projects
 * started in the window were quoted — and a share with exactly two parts, got
 * there and did not, is the one shape a ring answers at a glance: the filled
 * arc against the empty one, the per-cent in the middle and the fraction in
 * words beside it, so nothing is taken on trust from a division (D59).
 *
 * A project quoted four times counts once, or the ring would answer "how much
 * paper do we produce" rather than "how much of the work turns into paper" —
 * and the two halves of a fraction have to be about the same rows, which is the
 * defect this was written with (`src/lib/metrics.ts`).
 *
 * The quotations ring opens the quotations of the window that have a dispatch,
 * through the chain card's own cohort. The projects ring opens nothing yet: the
 * projects list has no window to narrow by, and until it does a ring that
 * pressed through to every project would count a different set of rows than it
 * says (D117).
 */
export async function RatiosCard({
  ratios,
  from,
  personId,
}: {
  ratios: ChainRatios;
  from: Day;
  personId: string | null;
}) {
  const t = await getTranslations();

  const nothing = ratios.projects === 0 && ratios.quotations === 0;

  return (
    <section className="card-face flex flex-col gap-4 p-4">
      <h2 className="text-sm font-medium text-foreground">{t("team.ratios")}</h2>

      {/* A window with nothing raised in it is the answer to the question, not
          a blank card (D127). */}
      {nothing ? (
        <p className="text-sm text-muted-foreground">{t("team.ratiosNone")}</p>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <ProgressRing
              slot="quoted"
              part={ratios.quotedProjects}
              whole={ratios.projects}
              label={t("team.ratioQuoted")}
              fraction={t("team.ratioOf", { part: ratios.quotedProjects, whole: ratios.projects })}
              href={null}
              ink={toneInk("open")}
            />
            <ProgressRing
              slot="dispatched"
              part={ratios.dispatchedQuotations}
              whole={ratios.quotations}
              label={t("team.ratioDispatched")}
              fraction={t("team.ratioOf", {
                part: ratios.dispatchedQuotations,
                whole: ratios.quotations,
              })}
              href={`/quotations?${narrowingQuery({ from, credited: personId, dispatched: true })}`}
              // Blue for both, as the board's Quoted and Dispatching columns
              // are (D184): out in the world, nobody late.
              ink={toneInk("open")}
            />
          </div>

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
