import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { DispatchDrawer } from "@/components/dispatches/dispatch-drawer";
import { DispatchSheetSkeleton, DispatchesTable } from "@/components/dispatches/dispatches-table";
import { QuotationDrawer } from "@/components/quotations/quotation-drawer";
import {
  QuotationSheetSkeleton,
  QuotationsTable,
} from "@/components/quotations/quotations-table";
import { StandingStrip } from "@/components/ui-ext/standing-strip";
import { requireUser } from "@/lib/authz";
import { listNonWorkingDays } from "@/lib/calendar";
import { addDays, formatDay, todayRiyadh } from "@/lib/dates";
import { listDispatches } from "@/lib/dispatches";
import { listQuotations } from "@/lib/quotations";
import { queueStanding } from "@/lib/standing";
import {
  countLate,
  LATE_AFTER_WORKING_DAYS,
  longestWait,
  waitedSince,
  type Waited,
} from "@/lib/waiting";

/**
 * The coordinator's queue: everything waiting on her, and nothing else
 * (SPEC S9, S28, S39).
 *
 * Both chains, one screen, in the order the work arrives — quotations to price,
 * then dispatches to check. She runs both, and two screens would mean choosing
 * which one to have open while the other filled up behind her.
 *
 * One status by definition in each half, so there are no filter chips: a chip
 * that only ever has one setting is a control that does nothing. Something she
 * has answered has left her desk and is on the rep's list, which is where the
 * next move is.
 *
 * Two lists means two things could be open, so they use different words for it:
 * `?open=` is a quotation and `?dispatch=` is a dispatch. One word for both
 * would open two drawers on the same id.
 *
 * Her home is this screen (`homeFor` in src/lib/authz.ts), so it is the first
 * thing she sees: what is waiting, not a record to look something up in.
 *
 * From P8 it opens on four figures — how many of each are waiting, how long the
 * worst one has been there, and how many she has answered today. They are hers,
 * not a report about her: the first three are the work, and the fourth is the
 * only one on any screen that says a day is going well (DESIGN §6).
 *
 * In P9.4 each of the four gained the line Jerom asked for: what the number
 * means, in words, beside it (D59). Two of them changed shape to earn it. The
 * longest wait was a DATE — "03/Sep" — which is the right fact asked the wrong
 * way round, because the reader has to do the arithmetic and over a weekend the
 * arithmetic they do in their head is wrong; it is a length now, in working
 * days, and the date is the caption. And "answered today" had nothing to be
 * measured against, so it says what arrived today beside it: five answered
 * against four arrived is a day going well, and five against twelve is not.
 */

type Search = { q?: string; open?: string; dispatch?: string };

export default async function QueuePage({ searchParams }: { searchParams: Promise<Search> }) {
  const [user, locale, params] = await Promise.all([requireUser(), getLocale(), searchParams]);

  const q = (params.q ?? "").trim();
  const open = params.open?.trim() || null;
  const openDispatch = params.dispatch?.trim() || null;

  const today = todayRiyadh();

  const [t, quotationRows, dispatchRows, standing, nonWorking] = await Promise.all([
    getTranslations(),
    listQuotations({ user, q: q || undefined, status: "requested", locale }),
    listDispatches({ user, q: q || undefined, status: "submitted", locale }),
    queueStanding(),
    // Sixty days back covers any wait this desk has ever had, and the holidays
    // in it are why a wait is counted in working days at all (S48).
    listNonWorkingDays(addDays(today, -60), today),
  ]);

  // The counts come from the rows already on the page, so the strip cannot say
  // three while the list under it shows two (rules/data.md).
  const waiting = quotationRows.length + dispatchRows.length;

  // Both chains, one rule (src/lib/waiting.ts): the manager's screen has called
  // a request stuck after two working days since P8, and until now the person
  // who could clear it was the only one not told.
  const worst = longestWait(standing.waitingSince, today, nonWorking);
  const lateQuotations = countLate(
    quotationRows.map((row) => row.createdOn),
    today,
    nonWorking,
  );
  const lateDispatches = countLate(
    dispatchRows.map((row) => row.createdOn),
    today,
    nonWorking,
  );

  // Computed here and handed down, rather than in each table: the tables are
  // client components and the holiday table is a database read, so the rule
  // stays on the server and only its answer crosses (rules/data.md).
  const waits = (rows: { id: string; createdOn: string }[]): Record<string, Waited> =>
    Object.fromEntries(rows.map((row) => [row.id, waitedSince(row.createdOn, today, nonWorking)]));

  const lateText = (count: number) =>
    t("queue.latePart", { late: count, days: LATE_AFTER_WORKING_DAYS });

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-xl font-semibold">{t("common.queue")}</h1>

      <StandingStrip
        items={[
          {
            label: t("common.quotations"),
            value: (
              <span dir="ltr" className="num">
                {quotationRows.length}
              </span>
            ),
            caption: <LateCaption count={lateQuotations} text={lateText(lateQuotations)} />,
            tone: quotationRows.length > 0 ? "wait" : null,
          },
          {
            label: t("common.dispatches"),
            value: (
              <span dir="ltr" className="num">
                {dispatchRows.length}
              </span>
            ),
            caption: <LateCaption count={lateDispatches} text={lateText(lateDispatches)} />,
            tone: dispatchRows.length > 0 ? "wait" : null,
          },
          {
            label: t("queue.longestWait"),
            value: worst ? (
              t("queue.workingDays", { days: worst.days })
            ) : (
              <span className="text-muted-foreground">—</span>
            ),
            caption: worst
              ? t("queue.since", { day: formatDay(oldest(standing.waitingSince), locale) })
              : t("queue.nothingWaiting"),
            // Late is late whoever it is waiting on: the same red the rest of
            // the app uses for an overdue date (DESIGN §6).
            tone: worst?.late ? "bad" : null,
          },
          {
            label: t("queue.answeredToday"),
            value: (
              <span dir="ltr" className="num">
                {standing.answeredToday}
              </span>
            ),
            caption: t("queue.arrivedToday", { arrived: standing.arrivedToday }),
            // Green only when she is at least level with what came in. Answering
            // five of twelve is not a day going well, and a screen that says it
            // is stops being read.
            tone:
              standing.answeredToday > 0 && standing.answeredToday >= standing.arrivedToday
                ? "good"
                : null,
          },
        ]}
      />

      {waiting === 0 ? (
        <p className="card-face px-6 py-8 text-center text-sm text-muted-foreground">
          {t("queue.clear")}
        </p>
      ) : null}

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-muted-foreground">{t("common.quotations")}</h2>
        <QuotationsTable
          base="/queue"
          rows={quotationRows}
          q={q}
          status="requested"
          openId={open}
          showFilters={false}
          waiting={waits(quotationRows)}
        />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-muted-foreground">{t("common.dispatches")}</h2>
        <DispatchesTable
          base="/queue"
          param="dispatch"
          rows={dispatchRows}
          q={q}
          status="submitted"
          openId={openDispatch}
          showFilters={false}
          waiting={waits(dispatchRows)}
        />
      </section>

      <Suspense key={open ?? "closed"} fallback={open ? <QuotationSheetSkeleton /> : null}>
        <QuotationDrawer quotationId={open} />
      </Suspense>

      <Suspense
        key={openDispatch ?? "closed-dispatch"}
        fallback={openDispatch ? <DispatchSheetSkeleton /> : null}
      >
        <DispatchDrawer dispatchId={openDispatch} param="dispatch" />
      </Suspense>
    </div>
  );
}

/** The earliest of a list of days. Only called when the list is not empty. */
function oldest(days: readonly string[]): string {
  return days.reduce((worst, day) => (worst === "" || day < worst ? day : worst), "");
}

/**
 * A caption that says how many are past the line, with the figure on the
 * element as well as in the sentence.
 *
 * The sentence has two numbers in it — how many are late, and what late means —
 * and that is the right sentence for a person and the wrong one for a test:
 * reading "none past 2 working days" for its first digit gives 2. `data-tone`
 * is already how a spec reads a colour without reading a hex (DESIGN §6); this
 * is the same idea for a count, so the thing under test is the arithmetic and
 * not the wording of either language.
 */
function LateCaption({ count, text }: { count: number; text: string }) {
  return <span data-late-count={count}>{text}</span>;
}
