import { getLocale, getTranslations } from "next-intl/server";
import { formatDay } from "@/lib/dates";
import { CHAIN_STAGES, shareOf, type ChainCohort } from "@/lib/chain";
import { ShareBars } from "@/components/ui-ext/share-bars";
import { TONE_TEXT, type StateTone } from "@/lib/state-tone";
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
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  // The window in words, and it is the day itself rather than a count of days
  // back from today: the reader picked a window above this card and the card
  // says which one he is reading (D154).
  const from = formatDay(cohort.from, locale);

  if (cohort.raised === 0) {
    return (
      <section className="card-face flex flex-col gap-2 p-4">
        <h2 className="text-sm font-medium text-muted-foreground">{t("team.chainTitle")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("team.chainEmpty", { from })}
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
          {t("team.chainMeans", { raised: cohort.raised, from })}
        </p>
      </div>

      <ShareBars
        rows={CHAIN_STAGES.map((stage) => {
          const count = cohort.ended[stage];
          const share = shareOf(cohort, stage);
          const tone = STAGE_TONE[stage];

          return {
            key: stage,
            // The one handle a spec has on which ending this is: the row draws
            // a word, never a code (DESIGN §2).
            data: { "data-stage": stage },
            tone,
            share,
            label: (
              <span className={cn(count === 0 && "text-faint")}>
                {t(`team.chain.${stage}`)}
                {/* A count hides an age: "sent back" with three in it might be
                    three from this morning or one from March (D101). */}
                {stage === "returned" && count > 0 && cohort.returnedOldestDays !== null ? (
                  <>
                    {/* A visible separator, not only a margin: read aloud or
                        selected, label and caption ran together in both
                        languages ("…yet the oldest…"). */}
                    {" "}
                    <span className="text-xs text-muted-foreground">
                      {"— "}
                      {t("team.chainReturnedOldest", { days: cohort.returnedOldestDays })}
                    </span>
                  </>
                ) : null}
              </span>
            ),
            figure: (
              <span dir="ltr" className={cn("num font-medium", count === 0 && "text-faint")}>
                {count}
              </span>
            ),
            support: (
              <span dir="ltr" className={cn("num", count > 0 ? TONE_TEXT[tone] : "text-faint")}>
                {t("common.percent", { percent: share })}
              </span>
            ),
          };
        })}
      />

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
