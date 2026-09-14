"use client";

import { useLocale } from "next-intl";
import { WORK_ROW, WORK_ROWS } from "@/components/team/work-grid";
import { DayText } from "@/components/ui-ext/day-text";
import { Ref } from "@/components/ui-ext/figures";
import { Link } from "@/i18n/navigation";
import type { Day } from "@/lib/dates";
import { TONE_TEXT } from "@/lib/state-tone";
import { cn } from "@/lib/utils";

/**
 * The rows of one group of the stuck list, drawn on the client from plain
 * data (D82). Every row is a link with three spans inside it; rendered from a
 * server loop, each row's link was serialised into the page with its whole
 * card as props, and a hundred stuck rows cost the manager's screen twice its
 * markup again in a second copy of itself.
 */
export type StuckRowData = {
  key: string;
  href: string;
  /** A document number such as Q-12, drawn LTR as a figure. */
  label?: string;
  /** The customer's or the project's name. */
  name?: string;
  /** The customer, where the row is about something of his. */
  companyName?: string;
  /** Whose floor it is on. */
  who: string;
  /** The date the row is late against, where there is one. */
  day?: Day;
  /** How late, in words. */
  note: string;
};

export function StuckRows({ rows }: { rows: StuckRowData[] }) {
  const locale = useLocale();

  /*
   * One row a thing, inside its group's card (P13-S8): what it is on the first
   * line, whose it is and how late on the second. The card is a third of a desk
   * wide in the grid and the whole of a phone, so the row is laid out for the
   * narrow case at every width rather than guessing from the screen's — a row
   * whose customer's name is unreadable is a row nobody can act on.
   *
   * The spans stay in this order, note last: specs read how late a row is from
   * its last span (tests/calendar.spec.ts).
   */
  return (
    <ul className={WORK_ROWS}>
      {rows.map((row) => (
        <li key={row.key}>
          <Link
            href={row.href}
            className={cn(
              WORK_ROW,
              "hover-tint flex flex-col gap-1 outline-none focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-ring/50",
            )}
          >
            <span className="min-w-0 text-sm font-medium">
              {row.label ? <Ref>{row.label}</Ref> : <bdi>{row.name}</bdi>}
              {/* Two values and a separator: each in its own run, so the dot
                  settles against the paragraph and not against a name
                  (rules/words.md). */}
              {row.companyName ? (
                <>
                  <span aria-hidden="true" className="text-faint">
                    {" · "}
                  </span>
                  <bdi className="font-normal text-muted-foreground">{row.companyName}</bdi>
                </>
              ) : null}
            </span>
            <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs">
              <span className="text-muted-foreground">{row.who}</span>
              <span className={TONE_TEXT.wait}>
                {row.day ? (
                  <>
                    <DayText day={row.day} locale={locale} />
                    <span aria-hidden="true">{" · "}</span>
                  </>
                ) : null}
                {row.note}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
