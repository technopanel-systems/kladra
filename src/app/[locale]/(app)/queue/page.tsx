import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { DispatchDrawer } from "@/components/dispatches/dispatch-drawer";
import { DispatchSheetSkeleton, DispatchesTable } from "@/components/dispatches/dispatches-table";
import { QuotationDrawer } from "@/components/quotations/quotation-drawer";
import {
  QuotationSheetSkeleton,
  QuotationsTable,
} from "@/components/quotations/quotations-table";
import { DayText } from "@/components/ui-ext/day-text";
import { StandingStrip } from "@/components/ui-ext/standing-strip";
import { requireUser } from "@/lib/authz";
import { listDispatches } from "@/lib/dispatches";
import { listQuotations } from "@/lib/quotations";
import { queueStanding } from "@/lib/standing";
import { todayRiyadh } from "@/lib/dates";

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
 */

type Search = { q?: string; open?: string; dispatch?: string };

export default async function QueuePage({ searchParams }: { searchParams: Promise<Search> }) {
  const [user, locale, params] = await Promise.all([requireUser(), getLocale(), searchParams]);

  const q = (params.q ?? "").trim();
  const open = params.open?.trim() || null;
  const openDispatch = params.dispatch?.trim() || null;

  const [t, quotationRows, dispatchRows, standing] = await Promise.all([
    getTranslations(),
    listQuotations({ user, q: q || undefined, status: "requested", locale }),
    listDispatches({ user, q: q || undefined, status: "submitted", locale }),
    queueStanding(),
  ]);

  // The counts come from the rows already on the page, so the strip cannot say
  // three while the list under it shows two (rules/data.md).
  const waiting = quotationRows.length + dispatchRows.length;
  const today = todayRiyadh();

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
            tone: quotationRows.length > 0 ? "wait" : null,
          },
          {
            label: t("common.dispatches"),
            value: (
              <span dir="ltr" className="num">
                {dispatchRows.length}
              </span>
            ),
            tone: dispatchRows.length > 0 ? "wait" : null,
          },
          {
            label: t("queue.oldest"),
            value:
              standing.oldestWaitingOn === null ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                <DayText day={standing.oldestWaitingOn} locale={locale} />
              ),
            // Late is late whoever it is waiting on: the same red the rest of
            // the app uses for an overdue date (DESIGN §6).
            tone:
              standing.oldestWaitingOn !== null && standing.oldestWaitingOn < today ? "bad" : null,
          },
          {
            label: t("queue.answeredToday"),
            value: (
              <span dir="ltr" className="num">
                {standing.answeredToday}
              </span>
            ),
            tone: standing.answeredToday > 0 ? "good" : null,
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
