"use client";

import { useLocale, useTranslations } from "next-intl";
import { Avatar } from "@/components/ui-ext/avatar";
import { DayText } from "@/components/ui-ext/day-text";
import { Ref, Sqm } from "@/components/ui-ext/figures";
import { Empty } from "@/components/ui-ext/empty";
import { LinkPending } from "@/components/ui-ext/link-pending";
import { StickyScroll } from "@/components/ui-ext/sticky-scroll";
import { Link } from "@/i18n/navigation";
import type { Day } from "@/lib/dates";
import { TONE_CLASS, TONE_TEXT, type StateTone } from "@/lib/state-tone";
import { cn } from "@/lib/utils";

/**
 * A board of states — the second view on quotations, dispatches and projects
 * (DESIGN §6, SPEC §3 P13).
 *
 * It exists to answer "what is stuck", which a list cannot: a column with a
 * count says where work piles up, and a card carrying the day it arrived says
 * what has gone stale. A board without those two is decoration, which is the
 * whole argument for not putting one on companies.
 *
 * **No drag-and-drop, and not because a rule says so.** Every move this
 * business makes needs data somebody else supplies — Issued needs SMAC's
 * number, Rejected and Refused need a written reason, Accepted is the
 * customer's answer; a project moves because a price went out or a load was
 * approved (D170). A drag that opens a dialog is a worse button than a button,
 * so a card opens its record and the record carries its actions.
 *
 * RTL comes free: the columns are a flex row inside a document that is already
 * `dir="rtl"`, so the first column is the rightmost one and the scroll runs the
 * other way. Nothing here names a physical side.
 */

export type BoardCard = {
  id: string;
  /** Where pressing it goes — the same drawer the list opens. */
  href: string;
  /**
   * Q-12 or D-4: a code, so it carries its own direction. Absent on a card whose
   * record has no number anybody says — a project is its name (DESIGN §2).
   */
  label?: string;
  title: string;
  subtitle: string | null;
  sqm: string | null;
  /** The day it arrived in this state, which is how old it is. */
  day: Day | null;
  /** Whose it is, where the board is read for who is carrying what. */
  person?: { id: string; name: string };
  /** True for the record whose drawer is open, so the board says where you are. */
  current?: boolean;
};

export type BoardColumn = {
  key: string;
  label: string;
  tone: StateTone;
  cards: BoardCard[];
  /**
   * How many there are, where the reader counted them before a cap (D80). The
   * heading says this and not the length of what was drawn, so a column never
   * reads "200" over a state that holds three hundred.
   */
  total?: number;
};

export function Board({ columns }: { columns: BoardColumn[] }) {
  const t = useTranslations();
  const locale = useLocale();

  return (
    // One horizontal scroller, never the page: a board that widens the document
    // takes the whole app's layout with it (DESIGN §2). Its scrollbar is at the
    // top, where the reader is, not under the longest column (StickyScroll,
    // P13 13.3); the scroller contains its overscroll, so swiping past the last
    // column on a phone does not become the browser's back gesture.
    <StickyScroll label={t("common.viewBoard")}>
      <div
        data-slot="board"
        className="flex snap-x gap-3 px-1 pt-2 pb-2"
      >
        {columns.map((column) => {
          const count = column.total ?? column.cards.length;
          return (
            <section
              key={column.key}
              aria-label={`${column.label} (${count})`}
              data-column={column.key}
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
                  {count}
                </span>
              </header>

              {column.cards.length === 0 ? (
                <Empty size="panel">{t("common.boardEmpty")}</Empty>
              ) : (
                <ul className="flex flex-col gap-2">
                  {column.cards.map((card) => (
                    <li key={card.id}>
                      <BoardCardLink card={card} locale={locale} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </StickyScroll>
  );
}

function BoardCardLink({ card, locale }: { card: BoardCard; locale: string }) {
  return (
    <Link
      href={card.href}
      aria-current={card.current ? "true" : undefined}
      className={cn(
        "card-face hover-tint flex flex-col gap-1.5 p-3",
        card.current && "bg-surface-2",
      )}
    >
      <span className="flex items-baseline justify-between gap-2">
        {card.label ? (
          <span className="flex items-center gap-1.5">
            <Ref className="text-sm font-medium">{card.label}</Ref>
            <LinkPending />
          </span>
        ) : (
          // No number: the name leads, as a list row's does.
          <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
            <span data-slot="card-title" className="min-w-0 truncate">
              <bdi>{card.title}</bdi>
            </span>
            <LinkPending />
          </span>
        )}
        <Sqm value={card.sqm} className="shrink-0 text-xs" />
      </span>
      {card.label ? (
        <span className="truncate text-sm">
          <bdi>{card.title}</bdi>
        </span>
      ) : null}
      {card.subtitle ? (
        <span className="truncate text-xs text-muted-foreground">
          <bdi>{card.subtitle}</bdi>
        </span>
      ) : null}
      {card.day || card.person ? (
        <span className="flex items-center justify-between gap-2">
          {card.day ? (
            <DayText day={card.day} locale={locale} className="text-xs text-muted-foreground" />
          ) : (
            <span />
          )}
          {card.person ? (
            <span className="flex items-center">
              <Avatar id={card.person.id} name={card.person.name} size="sm" />
              <span className="sr-only">{card.person.name}</span>
            </span>
          ) : null}
        </span>
      ) : null}
    </Link>
  );
}
