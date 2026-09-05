import { getTranslations } from "next-intl/server";
import { LogDialogHost } from "@/components/activities/log-dialog";
import { CallBand, type CallBandData } from "@/components/day/call-band";
import { NO_TARGETS, type LogTargets } from "@/lib/log-targets";
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
 * This file decides WHAT the bands are; `CallBand` draws one, on the client,
 * from rows passed as data (D82). The one log dialog for the whole screen is
 * mounted here, above all four.
 */

export async function CallList({
  overdue,
  today,
  never,
  quiet,
  totals,
  targets,
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
  /**
   * What the log dialog needs, per company (D71). The whole point of this
   * screen is that the next thing he does is press the phone number; the thing
   * after that is say what was said, and it used to cost two page loads.
   */
  targets: Map<string, LogTargets>;
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

  // One log dialog for the whole screen (D82): every card carries a button
  // that names its company, and this is what the one form can be against.
  const logTargets = Object.fromEntries(
    bands.flatMap((band) =>
      band.rows.map((row) => [
        row.id,
        { companyName: row.name, ...(targets.get(row.id) ?? NO_TARGETS) },
      ]),
    ),
  );

  return (
    <LogDialogHost targets={logTargets}>
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">{t("day.whoToCall")}</h2>

        {bands.length === 0 ? (
          <p className="card-face px-4 py-6 text-center text-sm text-muted-foreground">
            {t("day.nobodyToCall")}
          </p>
        ) : (
          bands.map((band) => <CallBand key={band.key} band={band} />)
        )}
      </section>
    </LogDialogHost>
  );
}
