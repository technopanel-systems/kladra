import { getLocale, getTranslations } from "next-intl/server";
import { toneInk } from "@/components/metrics/colors";
import { SharePie, type PieSlice } from "@/components/metrics/share-pie";
import { formatDay } from "@/lib/dates";
import { CHAIN_STAGES, type ChainCohort } from "@/lib/chain";
import { narrowingQuery } from "@/lib/narrowing";
import { wholePercents } from "@/lib/slices";
import type { StateTone } from "@/lib/state-tone";

/**
 * Where quotations go (SPEC D62, Jerom's phase 9C) — a pie since §3 P13.
 *
 * One of his five questions, and the app could not answer any part of it. The
 * quotation screen says what each one IS right now; nothing said what becomes of
 * them as a population.
 *
 * It follows a COHORT rather than showing the pipeline as it stands: every
 * quotation raised in the window, forward, to the furthest point it reached.
 * Each one is counted once, at one ending, so the six endings are six parts of
 * the number the sentence names — a share of a whole, which is what a pie is
 * for, and six is exactly the most a pie may have (DESIGN §1b). The endings
 * keep the chain's order rather than being ranked, because "where it got to" is
 * read along the chain; the list beside the drawing reads the same way down.
 *
 * Every slice opens the quotations that ended there: the same cohort, through
 * the same clause and the same statuses (`cohortWhere`, `statusesOf`), every
 * revision its own row as it is here (S32).
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

export async function ChainCard({
  cohort,
  personId,
}: {
  cohort: ChainCohort;
  /** Whose paper — the picked rep, or null for the company. */
  personId: string | null;
}) {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  // The window in words, and it is the day itself rather than a count of days
  // back from today: the reader picked a window above this card and the card
  // says which one he is reading (D154).
  const from = formatDay(cohort.from, locale);

  if (cohort.raised === 0) {
    return (
      <section className="card-face flex flex-col gap-2 p-4">
        <h2 className="text-sm font-medium text-foreground">{t("team.chainTitle")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("team.chainEmpty", { from })}
        </p>
      </section>
    );
  }

  const shares = wholePercents(CHAIN_STAGES.map((stage) => cohort.ended[stage]));
  const slices: PieSlice[] = CHAIN_STAGES.map((stage, index) => {
    const count = cohort.ended[stage];
    return {
      key: stage,
      // The one handle a spec has on which ending this is: the row draws a
      // word, never a code (DESIGN §2).
      data: { "data-stage": stage },
      label: t(`team.chain.${stage}`),
      // A count hides an age: "sent back" with three in it might be three from
      // this morning or one from March (D101).
      caption:
        stage === "returned" && count > 0 && cohort.returnedOldestDays !== null
          ? t("team.chainReturnedOldest", { days: cohort.returnedOldestDays })
          : undefined,
      figure: String(count),
      share: shares[index],
      value: count,
      href:
        count > 0
          ? `/quotations?${narrowingQuery({ from: cohort.from, credited: personId, ended: [stage] })}`
          : null,
      ink: toneInk(STAGE_TONE[stage]),
    };
  });

  return (
    <section className="card-face flex flex-col gap-4 p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium text-foreground">{t("team.chainTitle")}</h2>
        {/* The question in words, which is the whole of D59 — and what the
            pie is a share OF, with the number in it. */}
        <p className="text-sm text-pretty">
          {t("team.chainMeans", { raised: cohort.raised, from })}
        </p>
      </div>

      <SharePie slices={slices} label={t("team.chainTitle")} />

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
