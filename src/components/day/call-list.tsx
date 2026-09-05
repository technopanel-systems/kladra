import { MessageCircle, NotebookPen } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { LogDialog } from "@/components/activities/log-dialog";
import { Button } from "@/components/ui/button";
import { DayText } from "@/components/ui-ext/day-text";
import { NO_TARGETS, type LogTargets } from "@/lib/log-targets";
import { Link } from "@/i18n/navigation";
import type { CompanyRow } from "@/lib/companies";
import { NEVER_CONTACTED_DAYS, type FollowUpCounts } from "@/lib/followups";
import { formatPhone, whatsappHref } from "@/lib/phone";
import { TONE_TEXT, type StateTone } from "@/lib/state-tone";
import { cn } from "@/lib/utils";

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
 */

type Band = {
  key: string;
  tone: StateTone;
  rows: CompanyRow[];
  /** How many there are, which is not how many are drawn on a long floor (D80). */
  total: number;
  /** Where the rest of them are, when there are more than fit here. */
  filter: string;
  /** What the band means, in words, where the name alone does not say it (D59). */
  means?: string;
};

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
  const locale = await getLocale();

  const bands: Band[] = (
    [
      { key: "common.overdue", tone: "bad", rows: overdue, total: totals.overdue, filter: "overdue" },
      { key: "common.dueToday", tone: "wait", rows: today, total: totals.today, filter: "today" },
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
        means: "common.quietMeans",
      },
    ] satisfies Band[]
  ).filter((band) => band.rows.length > 0);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium">{t("day.whoToCall")}</h2>

      {bands.length === 0 ? (
        <p className="card-face px-4 py-6 text-center text-sm text-muted-foreground">
          {t("day.nobodyToCall")}
        </p>
      ) : (
        bands.map((band) => (
          <div key={band.key} className="flex flex-col gap-2">
            <div className="flex flex-col gap-0.5">
              <h3
                className={cn("text-xs font-medium tracking-wide uppercase", TONE_TEXT[band.tone])}
              >
                {t(band.key)}{" "}
                <span dir="ltr" className="num">
                  {band.total}
                </span>
              </h3>
              {/* "Overdue" and "Due today" say what they are; "Gone quiet" is a
                  rule, and a rule with a threshold in it says the threshold. */}
              {band.means ? (
                <p className="text-xs text-muted-foreground">
                  {t(band.means, { days: NEVER_CONTACTED_DAYS })}
                </p>
              ) : null}
            </div>

            <ul className="flex flex-col gap-2">
              {band.rows.map((row) => (
                <li
                  key={row.id}
                  className="card-face relative flex flex-wrap items-center gap-x-4 gap-y-1.5 p-3"
                >
                  {/* Its own line on a phone. Sharing one line with the date
                      and the phone chip left about 150px for the name, and
                      «شركة أنماء للمقاولات» came out «شركة أنماء لـ…» — a rep
                      cannot tell which customer he is about to call (D65). */}
                  <span className="flex min-w-0 flex-1 basis-full flex-col gap-0.5 sm:basis-0">
                    <Link
                      href={`/companies?open=${row.id}`}
                      // The whole card is the target; the phone link on top of
                      // it is the exception, which is why it carries a z-index.
                      // The same stretched-link pattern the table uses: the
                      // ring lands on the name, which is the only part of the
                      // card a keyboard reader can see it against.
                      className="truncate rounded-sm text-sm font-medium outline-none after:absolute after:inset-0 focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <bdi>{row.name}</bdi>
                    </Link>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      {row.mainContactName ? <bdi>{row.mainContactName}</bdi> : null}
                      {row.cityName ? <span>{row.cityName}</span> : null}
                    </span>
                  </span>

                  {row.nextFollowUp ? (
                    <DayText
                      day={row.nextFollowUp}
                      locale={locale}
                      className={cn("text-xs", TONE_TEXT[band.tone])}
                    />
                  ) : null}

                  {/* Above the stretched link, like the phone number: the card
                      is one target and these two are the exceptions (D71). */}
                  <span className="relative z-10">
                    <LogDialog
                      companyId={row.id}
                      companyName={row.name}
                      contacts={(targets.get(row.id) ?? NO_TARGETS).contacts}
                      projects={(targets.get(row.id) ?? NO_TARGETS).projects}
                      trigger={
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          aria-label={t("day.logFor", { name: row.name })}
                        >
                          <NotebookPen aria-hidden="true" />
                          {t("common.log")}
                        </Button>
                      }
                    />
                  </span>

                  {row.mainContactPhone ? (
                    <a
                      href={whatsappHref(row.mainContactPhone)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="relative z-10 inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-xs hover:bg-surface"
                    >
                      <MessageCircle aria-hidden="true" className="size-3.5" />
                      <span dir="ltr" translate="no" className="num">
                        {formatPhone(row.mainContactPhone)}
                      </span>
                      <span className="sr-only">{t("drawer.openWhatsApp")}</span>
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>

            {/* The rest of them are one press away, on the list that narrows to
                this same band — the count above says how many there are, and
                this says where they are (D80). Printing all ninety on a phone
                is not showing them, it is burying the first one. */}
            {band.total > band.rows.length ? (
              <Link
                href={`/companies?filter=${band.filter}`}
                className="text-xs text-muted-foreground underline underline-offset-2"
              >
                {t("common.andMore", { count: band.total - band.rows.length })}
              </Link>
            ) : null}
          </div>
        ))
      )}
    </section>
  );
}
