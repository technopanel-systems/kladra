"use client";

import { useLocale, useTranslations } from "next-intl";
import { DayText } from "@/components/ui-ext/day-text";
import { Sqm } from "@/components/ui-ext/figures";
import { Link } from "@/i18n/navigation";
import type { Day } from "@/lib/dates";
import { TONE_CLASS, TONE_TEXT, type StateTone } from "@/lib/state-tone";
import { cn } from "@/lib/utils";

/**
 * A board of states — the second view on quotations and dispatches, and the
 * only screens that earn one (DESIGN §6).
 *
 * It exists to answer "what is stuck", which a list cannot: a column with a
 * count says where work piles up, and a card carrying the day it arrived says
 * what has gone stale. A board without those two is decoration, which is the
 * whole argument for not putting one on companies.
 *
 * **No drag-and-drop, and not because a rule says so.** Every move this
 * business makes needs data somebody else supplies — Issued needs SMAC's
 * number, Rejected and Refused need a written reason, Accepted is the
 * customer's answer. A drag that opens a dialog is a worse button than a
 * button, so a card opens its record and the record carries its actions.
 *
 * RTL comes free: the columns are a flex row inside a document that is already
 * `dir="rtl"`, so the first column is the rightmost one and the scroll runs the
 * other way. Nothing here names a physical side.
 */

export type BoardCard = {
  id: string;
  /** Where pressing it goes — the same drawer the list opens. */
  href: string;
  /** Q-12 or D-4: a code, so it carries its own direction. */
  label: string;
  title: string;
  subtitle: string | null;
  sqm: string;
  /** The day it arrived in this state, which is how old it is. */
  day: Day | null;
  /** True for the record whose drawer is open, so the board says where you are. */
  current?: boolean;
};

export type BoardColumn = {
  key: string;
  label: string;
  tone: StateTone;
  cards: BoardCard[];
};

export function Board({ columns }: { columns: BoardColumn[] }) {
  const t = useTranslations();
  const locale = useLocale();

  return (
    // One horizontal scroller, never the page: a board that widens the document
    // takes the whole app's layout with it (DESIGN §2).
    // `overscroll-x-contain`: swiping past the last column on a phone must not
    // become the browser's back gesture (DESIGN §2 — the page never scrolls
    // sideways, and neither does the history).
    <div
      data-slot="board"
      className="-mx-1 flex snap-x gap-3 overflow-x-auto overscroll-x-contain px-1 pb-2"
    >
      {columns.map((column) => (
        <section
          key={column.key}
          aria-label={`${column.label} (${column.cards.length})`}
          className="flex w-64 shrink-0 snap-start flex-col gap-2"
        >
          <header className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-2.5 py-1.5">
            <h3 className={cn("text-xs font-medium tracking-wide uppercase", TONE_TEXT[column.tone])}>
              {column.label}
            </h3>
            <span
              dir="ltr"
              className={cn("num rounded-full px-1.5 text-xs", TONE_CLASS[column.tone])}
            >
              {column.cards.length}
            </span>
          </header>

          {column.cards.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-xs text-muted-foreground">
              {t("common.boardEmpty")}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {column.cards.map((card) => (
                <li key={card.id}>
                  <Link
                    href={card.href}
                    aria-current={card.current ? "true" : undefined}
                    className={cn(
                      "card-face flex flex-col gap-1.5 p-3 transition-colors hover:bg-surface-2",
                      card.current && "ring-2 ring-ring/60",
                    )}
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span dir="ltr" className="num text-sm font-medium">
                        {card.label}
                      </span>
                      <Sqm value={card.sqm} className="text-xs" />
                    </span>
                    <bdi className="truncate text-sm">{card.title}</bdi>
                    {card.subtitle ? (
                      <bdi className="truncate text-xs text-muted-foreground">{card.subtitle}</bdi>
                    ) : null}
                    {card.day ? (
                      <DayText
                        day={card.day}
                        locale={locale}
                        className="text-xs text-muted-foreground"
                      />
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
