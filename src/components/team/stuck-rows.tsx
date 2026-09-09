"use client";

import { useLocale } from "next-intl";
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
   * Three things on one line where there is room, and three lines where there is
   * not. It was one flex row at every width: the name was the only child allowed
   * to shrink, so on a phone it gave up all its space to the rep's name and the
   * date beside it and came out one word per line, touching the text next to it.
   * A row about a customer whose name is unreadable is a row nobody can act on.
   */
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => (
        <li key={row.key}>
          <Link
            href={row.href}
            className="card-face flex flex-col gap-1 p-3 outline-none transition-colors hover:bg-surface-2 focus-visible:ring-3 focus-visible:ring-ring/50 sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-x-4"
          >
            <span className="min-w-0 text-sm sm:flex-1">
              {row.label ? (
                <Ref>{row.label}</Ref>
              ) : (
                <bdi>{row.name}</bdi>
              )}
              {/* Two values and a separator: each in its own run, so the dot
                  settles against the paragraph and not against a name
                  (rules/words.md). */}
              {row.companyName ? (
                <>
                  <span aria-hidden="true">{" · "}</span>
                  <bdi>{row.companyName}</bdi>
                </>
              ) : null}
            </span>
            <span className="text-xs text-muted-foreground">{row.who}</span>
            <span className={cn("text-xs", TONE_TEXT.wait)}>
              {row.day ? (
                <>
                  <DayText day={row.day} locale={locale} />
                  <span aria-hidden="true">{" · "}</span>
                </>
              ) : null}
              {row.note}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
