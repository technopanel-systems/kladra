import { getTranslations } from "next-intl/server";
import { CHAIN_STAGES, CHAIN_WINDOW_DAYS, shareOf, type ChainCohort } from "@/lib/chain";
import { TONE_BAR, TONE_TEXT, type StateTone } from "@/lib/state-tone";
import { cn } from "@/lib/utils";

/**
 * Where quotations go (SPEC D62, Jerom's phase 9C).
 *
 * One of his five questions, and the app could not answer any part of it. The
 * quotation screen says what each one IS right now; nothing said what becomes of
 * them as a population.
 *
 * It follows a COHORT rather than showing the pipeline as it stands: every
 * quotation raised in the last quarter, forward, to the furthest point it
 * reached. A funnel of current statuses is the board with the columns stacked,
 * and the board is already on the next screen.
 *
 * Horizontal bars, because the labels are sentences of different lengths and a
 * vertical bar under "The customer has not answered" is a column of one letter.
 * Every row carries its count and its share as text, so the bars are hidden from
 * readers — the same rule as the months card, for the same reason.
 */

/**
 * What colour each ending is, in the app's own five (DESIGN §6).
 *
 * Waiting and sent back are both amber: two different people owe the answer,
 * and from this screen's point of view they are one fact — it has stopped and
 * it will not move by itself. Withdrawn is grey because nothing happened at all
 * (D32). Rejected is red, and out with the customer is blue: nobody is late,
 * it is simply out in the world.
 */
const STAGE_TONE: Record<(typeof CHAIN_STAGES)[number], StateTone> = {
  waiting: "wait",
  returned: "wait",
  withdrawn: "over",
  withCustomer: "open",
  accepted: "good",
  rejected: "bad",
};

export async function ChainCard({ cohort }: { cohort: ChainCohort }) {
  const t = await getTranslations();

  if (cohort.raised === 0) {
    return (
      <section className="card-face flex flex-col gap-2 p-4">
        <h2 className="text-sm font-medium text-muted-foreground">{t("team.chainTitle")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("team.chainEmpty", { days: CHAIN_WINDOW_DAYS })}
        </p>
      </section>
    );
  }

  return (
    <section className="card-face flex flex-col gap-4 p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium text-muted-foreground">{t("team.chainTitle")}</h2>
        {/* The question in words, which is the whole of D59: a reader should
            not have to work out what a row of bars is counting. */}
        <p className="text-sm text-pretty">
          {t("team.chainMeans", { raised: cohort.raised, days: CHAIN_WINDOW_DAYS })}
        </p>
      </div>

      <ol className="flex flex-col gap-2">
        {CHAIN_STAGES.map((stage) => {
          const count = cohort.ended[stage];
          const share = shareOf(cohort, stage);
          const tone = STAGE_TONE[stage];

          return (
            <li key={stage} data-stage={stage} className="flex flex-col gap-1">
              <span className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                <span className={cn("min-w-0", count === 0 && "text-faint")}>
                  {t(`team.chain.${stage}`)}
                </span>
                <span className={cn("flex items-baseline gap-2", count === 0 && "text-faint")}>
                  <span dir="ltr" className="num font-medium">
                    {count}
                  </span>
                  <span dir="ltr" className={cn("num text-xs", count > 0 && TONE_TEXT[tone])}>
                    {t("team.chainShare", { percent: share })}
                  </span>
                </span>
              </span>

              <span aria-hidden="true" className="h-1.5 w-full rounded-full bg-surface-2">
                <span
                  style={{ inlineSize: `${share}%` }}
                  className={cn("block h-full rounded-full", TONE_BAR[tone])}
                />
              </span>
            </li>
          );
        })}
      </ol>

      {/* The one conversion in the chain that is about the market rather than
          about us: of the ones that actually reached a customer, how many he
          bothered to answer. Everything above it is our own handling. */}
      {cohort.reached > 0 ? (
        <p className="text-xs text-pretty text-muted-foreground">
          {t("team.chainAnswered", { answered: cohort.answered, reached: cohort.reached })}
        </p>
      ) : null}
    </section>
  );
}
