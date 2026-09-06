"use client";

import { useLocale, useTranslations } from "next-intl";
import { LogButton } from "@/components/activities/log-dialog";
import { DayText } from "@/components/ui-ext/day-text";
import { PhoneLinks } from "@/components/ui-ext/phone-links";
import { Link } from "@/i18n/navigation";
import type { CompanyRow } from "@/lib/companies";
import { TONE_TEXT, type StateTone } from "@/lib/state-tone";
import { cn } from "@/lib/utils";

/**
 * One band of the day's calls, drawn on the client from plain rows.
 *
 * Why a client component and not a server loop: this list is long — twenty-five
 * cards a band, four bands — and every card carries a link, a button and an
 * icon that must run in the browser. Rendered from a server component, each of
 * those is serialised into the page separately, with its own class strings and
 * props, once per card: a hundred cards put half a megabyte of that under the
 * rep's home screen before a single row was readable (DESIGN §5, D82). Drawn
 * here, the page carries the rows as data and the card once, as code.
 */

export type CallBandData = {
  /** The band's name, as one of the four keys `CallList` writes out in full. */
  key: "common.overdue" | "common.dueToday" | "common.neverContacted" | "common.goneQuiet";
  tone: StateTone;
  rows: CompanyRow[];
  /** How many there are, which is not how many are drawn on a long floor (D80). */
  total: number;
  /** Where the rest of them are, when there are more than fit here. */
  filter: string;
  /** What the band means, already in words, where the name alone does not say it (D59). */
  means?: string;
};

export function CallBand({ band }: { band: CallBandData }) {
  const t = useTranslations();
  const locale = useLocale();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <h3 className={cn("text-xs font-medium tracking-wide uppercase", TONE_TEXT[band.tone])}>
          {t(band.key)}{" "}
          <span dir="ltr" className="num">
            {band.total}
          </span>
        </h3>
        {/* "Overdue" and "Due today" say what they are; "Gone quiet" is a
            rule, and a rule with a threshold in it says the threshold. */}
        {band.means ? <p className="text-xs text-muted-foreground">{band.means}</p> : null}
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
                {/* The same words the customer list uses when there is nobody
                    to call (D98): a card on "Calls due" with no contact and no
                    number said nothing, and the rep read it as a card to tap. */}
                {row.mainContactName ? (
                  <bdi>{row.mainContactName}</bdi>
                ) : row.mainContactPhone ? null : (
                  <span className="text-faint">{t("companies.noContact")}</span>
                )}
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
              <LogButton
                companyId={row.id}
                contactId={row.mainContactId}
                variant="outline"
                size="sm"
                className="text-xs"
                aria-label={t("day.logFor", { name: row.name })}
                icon
              >
                {t("common.log")}
              </LogButton>
            </span>

            {row.mainContactPhone ? (
              <PhoneLinks
                name={row.mainContactName ?? row.name}
                phone={row.mainContactPhone}
                chip
              />
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
  );
}
