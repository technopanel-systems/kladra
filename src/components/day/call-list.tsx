import { getTranslations } from "next-intl/server";
import { CallBand, type CallBandData } from "@/components/day/call-band";
import { WORK_CARD } from "@/components/team/work-grid";
import { Empty } from "@/components/ui-ext/empty";
import type { CompanyRow } from "@/lib/companies";
import { NEVER_CONTACTED_DAYS, type FollowUpCounts } from "@/lib/followups";

/**
 * Who is owed a call, in the order they are owed it (SPEC §3, P8).
 *
 * This is the timeline, and the reason it is not drawn as one: a rep reads this
 * standing up, on a phone, and a horizontal axis of the next fortnight answers
 * "when" when the question is "who first". Four bands, worst at the top, and
 * the phone number is on the row — the whole point is that the next thing he
 * does is press it (DESIGN §6).
 *
 * The fourth band arrived in P9.4 and is the leak the five-day walk found: a
 * customer contacted once, with no next step on him or on any of his live
 * projects, is on no band of any screen and eight of Faisal's twelve were in
 * exactly that state (D63). It is last because it is the least urgent of the
 * four — nobody is expecting a call today — and it is the one that loses
 * customers, which is why it is here at all rather than in a report.
 *
 * Each band is a card of its own in the day's grid (P13-S8), so a day with an
 * overdue call and nothing else is one card and not four headings; the section
 * around them is `contents` — it names the calls for a reader and a spec, and
 * lends the grid its children rather than drawing a box of its own. A band
 * with nobody in it is not drawn at all, and a day with nobody to call is one
 * card that says so.
 *
 * This file decides WHAT the bands are; `CallBand` draws one, on the client,
 * from rows passed as data (D82). The report a call ends in opens in the one
 * popup the top bar mounts for the whole app, prefilled with the customer and
 * the person on the card.
 */

export async function CallList({
  overdue,
  today,
  never,
  quiet,
  totals,
}: {
  overdue: CompanyRow[];
  today: CompanyRow[];
  never: CompanyRow[];
  quiet: CompanyRow[];
  /**
   * How many each band has altogether. The rows are capped at what a person can
   * read standing up; the heading is the figure, and it comes from the same
   * follow-up definition the strip on his list uses, so the two cannot disagree
   * (rules/data.md, D80).
   */
  totals: FollowUpCounts;
}) {
  const t = await getTranslations();

  const bands: CallBandData[] = (
    [
      {
        key: "common.overdue",
        tone: "bad",
        rows: overdue,
        total: totals.overdue,
        filter: "overdue",
      },
      {
        key: "common.dueToday",
        tone: "wait",
        rows: today,
        total: totals.today,
        filter: "today",
      },
      {
        key: "common.neverContacted",
        tone: "open",
        rows: never,
        total: totals.neverContacted,
        filter: "never",
      },
      {
        key: "common.goneQuiet",
        tone: "over",
        rows: quiet,
        total: totals.goneQuiet,
        filter: "quiet",
        means: t("common.quietMeans", { days: NEVER_CONTACTED_DAYS }),
      },
    ] satisfies CallBandData[]
  ).filter((band) => band.rows.length > 0);

  if (bands.length === 0) {
    return (
      <section className={WORK_CARD}>
        <h2 className="text-sm font-medium">{t("day.whoToCall")}</h2>
        <Empty size="panel">{t("day.nobodyToCall")}</Empty>
      </section>
    );
  }

  return (
    <section className="contents">
      {/* Absolutely placed, so it takes no cell of the grid: the band cards
          each carry their own visible heading under it. */}
      <h2 className="sr-only">{t("day.whoToCall")}</h2>
      {bands.map((band) => (
        <CallBand key={band.key} band={band} />
      ))}
    </section>
  );
}
