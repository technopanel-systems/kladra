import { getTranslations } from "next-intl/server";
import { CallBand, type CallBandData } from "@/components/day/call-band";
import { WorkTitle } from "@/components/team/work-grid";
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
 * Each band is a card of its own (P13-S8), so a day with an overdue call and
 * nothing else is one card and not four headings. The section around them is
 * the day's second stack (S12.6): the calls, one card under another, beside
 * what came back to him on a desk and under it on a phone. It names the calls
 * for a reader and a spec with a heading nobody needs to see — every card under
 * it carries its own. A band with nobody in it is not drawn at all, and a day
 * with nobody to call is that heading, shown, over the space the cards would
 * take.
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
        // Blue, as its pair above and as the manager's stuck card for the same
        // customers: nobody is waiting on this call today, and it is how
        // customers are lost (D63). It was grey here and blue there — one
        // state in two colours (S12.6).
        tone: "open",
        rows: quiet,
        total: totals.goneQuiet,
        filter: "quiet",
        means: t("common.quietMeans", { days: NEVER_CONTACTED_DAYS }),
      },
    ] satisfies CallBandData[]
  ).filter((band) => band.rows.length > 0);

  // Nobody to call: the title over the space the cards would take, not a card
  // with a dashed box inside it — two edges saying one thing (DESIGN §1b).
  if (bands.length === 0) {
    return (
      <section data-slot="calls" className="flex min-w-0 flex-col gap-3">
        <WorkTitle as="h2">{t("day.whoToCall")}</WorkTitle>
        <Empty size="panel">{t("day.nobodyToCall")}</Empty>
      </section>
    );
  }

  return (
    <section data-slot="calls" className="flex min-w-0 flex-col gap-6">
      {/* Read, not drawn: each band card carries its own visible heading. */}
      <h2 className="sr-only">{t("day.whoToCall")}</h2>
      {bands.map((band) => (
        <CallBand key={band.key} band={band} />
      ))}
    </section>
  );
}
