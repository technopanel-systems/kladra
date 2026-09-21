"use client";

import { useLocale, useTranslations } from "next-intl";
import { ReportButton } from "@/components/reports/report-dialog";
import {
  WORK_CARD,
  WORK_ROW,
  WORK_ROW_ACTIONS,
  WORK_ROWS,
  WorkTitle,
} from "@/components/team/work-grid";
import { Avatar } from "@/components/ui-ext/avatar";
import { DayText } from "@/components/ui-ext/day-text";
import { LinkPending } from "@/components/ui-ext/link-pending";
import { PhoneLinks } from "@/components/ui-ext/phone-links";
import { Prose } from "@/components/ui-ext/prose";
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
 *
 * Since the restyle the band's tone is a dot before its title and never the
 * title's own colour (DESIGN §1): "Overdue" in red and "Never contacted" in blue
 * made four headings as loud as the dates under them. The date keeps its tone
 * where it is late or due, because a late date is what `TONE_TEXT` is for.
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
  // Only a date that is late or due today is coloured; a band that is about
  // silence carries no blame in its dates (D141).
  const dateTone = band.tone === "bad" || band.tone === "wait" ? TONE_TEXT[band.tone] : "text-muted-foreground";

  return (
    <section data-slot="call-band" data-band={band.filter} className={WORK_CARD}>
      <div className="flex flex-col gap-0.5">
        <WorkTitle tone={band.tone} count={band.total}>
          {t(band.key)}
        </WorkTitle>
        {/* "Overdue" and "Due today" say what they are; "Gone quiet" is a
            rule, and a rule with a threshold in it says the threshold. Under
            the words, not under the dot. */}
        {band.means ? <p className="ps-4 text-xs text-muted-foreground">{band.means}</p> : null}
      </div>

      <ul className={WORK_ROWS}>
        {band.rows.map((row) => (
          <li key={row.id} className={cn(WORK_ROW, "row-door flex flex-col gap-2")}>
            {/* The company's face, the name and the day on one line, what to
                press under it. The name has the line to itself but for the
                date: sharing it with the phone chip as well left about 150px,
                and «شركة أنماء للمقاولات» came out «شركة أنماء لـ…» — a rep
                cannot tell which customer he is about to call (D65). */}
            <span className="flex items-start gap-3">
              {/* The face every screen gives this company (DESIGN §1b). A dot
                  on it only for an overdue follow-up, the one state §1b gives a
                  company; the card's title says the word. */}
              <Avatar
                id={row.id}
                name={row.name}
                kind="company"
                size="sm"
                ring={band.filter === "overdue" ? "bad" : undefined}
              />
              <span className="flex min-w-0 flex-1 items-start justify-between gap-3">
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <Link
                    data-door
                    href={`/companies?open=${row.id}`}
                    // The whole card is the target; the controls under it are
                    // the exception, which is why they carry a z-index
                    // (globals.css `row-door`). It wraps rather than truncates:
                    // beside the date in half a desk, a long Arabic name cut at
                    // the end is a customer nobody can tell apart (D65).
                    className="flex items-center gap-1.5 text-sm font-medium break-words"
                  >
                    <bdi>{row.name}</bdi>
                    <LinkPending />
                  </Link>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    {/* The same words the customer list uses when there is
                        nobody to call (D98). */}
                    {row.mainContactName ? (
                      <bdi>{row.mainContactName}</bdi>
                    ) : row.mainContactPhone ? null : (
                      <span className="text-faint">{t("companies.noContact")}</span>
                    )}
                    {row.mainContactName && row.cityName ? (
                      <span aria-hidden="true" className="text-faint">
                        ·
                      </span>
                    ) : null}
                    {row.cityName ? <bdi>{row.cityName}</bdi> : null}
                  </span>
                  {/* Why the call is owed: the last thing written about him, one
                      line, in the writer's own direction (D111). */}
                  {row.lastActivityText ? (
                    <Prose
                      line
                      text={row.lastActivityText}
                      slot="last-said"
                      className="line-clamp-1 text-xs text-muted-foreground"
                    />
                  ) : null}
                </span>

                {row.nextFollowUp ? (
                  <span className="flex shrink-0 items-baseline gap-1 text-xs">
                    {/* Whose date this is, when it is not the customer's own
                        (D9, D94). Without it the card showed a red day and the
                        report it opened moved the COMPANY's date, so the call
                        was made and the card stayed red. A dot and not a gap:
                        two values side by side with space between them are read
                        in the page's order by an eye running the other way
                        (rules/words.md). */}
                    {row.dueProject ? (
                      <>
                        <span className="max-w-28 truncate text-muted-foreground">
                          {/* Read rather than drawn: beside the customer's name
                              and a date, a bare job name is plain to an eye and
                              says nothing to a screen reader. Not an aria-label
                              on this span — a name on an element with no role of
                              its own is a thing readers may drop (axe). */}
                          <span className="sr-only">
                            {t("reports.dueFor", { name: row.dueProject.name })}
                          </span>
                          <span aria-hidden="true">
                            <bdi>{row.dueProject.name}</bdi>
                          </span>
                        </span>
                        <span aria-hidden="true" className="text-faint">
                          ·
                        </span>
                      </>
                    ) : null}
                    <DayText day={row.nextFollowUp} locale={locale} className={dateTone} />
                  </span>
                ) : null}
              </span>
            </span>

            {/* Above the stretched link, like the phone number: the card is one
                target and these are the exceptions (D71). The report a call
                ends in opens on this customer and the person on the card (SPEC
                §3 P13). Lined up with the words, not with the face. */}
            <span className={WORK_ROW_ACTIONS}>
              <ReportButton
                companyId={row.id}
                companyName={row.name}
                contactId={row.mainContactId}
                // The job whose date is the one that is due, so the report
                // lands where the reminder is and the call clears it (S52). On
                // most cards there is none and the report is the customer's.
                projectId={row.dueProject?.id}
                // A card in a band of calls is a call until he says otherwise:
                // the kind is the first of five answers and this is the one
                // screen that already knows it (SPEC §3 P13).
                kind="call"
                variant="outline"
                size="sm"
                aria-label={t("reports.addFor", { name: row.name })}
                icon
              >
                {t("common.addReport")}
              </ReportButton>

              {row.mainContactPhone ? (
                <PhoneLinks
                  name={row.mainContactName ?? row.name}
                  phone={row.mainContactPhone}
                  chip
                />
              ) : null}
            </span>
          </li>
        ))}
      </ul>

      {/* The rest of them are one press away, on the list that narrows to
          this same band — the count above says how many there are, and
          this says where they are (D80). */}
      {band.total > band.rows.length ? (
        <Link
          href={`/companies?filter=${band.filter}`}
          className="text-xs text-muted-foreground underline underline-offset-2"
        >
          {t("common.andMore", { count: band.total - band.rows.length })}
        </Link>
      ) : null}
    </section>
  );
}
