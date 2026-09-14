"use client";

import { useId, type KeyboardEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Avatar } from "@/components/ui-ext/avatar";
import { Clip } from "@/components/ui-ext/clip";
import { DayText } from "@/components/ui-ext/day-text";
import { Ref, Sqm } from "@/components/ui-ext/figures";
import { Empty } from "@/components/ui-ext/empty";
import { chipClass } from "@/components/ui-ext/filter-chip";
import { LinkPending } from "@/components/ui-ext/link-pending";
import { ScrollLine, StickyScroll } from "@/components/ui-ext/sticky-scroll";
import { useArrivedIds } from "@/hooks/use-arrived";
import { Link } from "@/i18n/navigation";
import type { Day } from "@/lib/dates";
import { TONE_DOT, type StateTone } from "@/lib/state-tone";
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
 *
 * **Two shapes, one on each side of the phone line** (P13-G6, DESIGN §8).
 *
 * - **A phone shows one column at a time**, under a picker that names every
 *   column with its count. Each column was 16rem in a sideways scroller at
 *   every width, so 375 pixels showed one column and ninety of the next with
 *   its header cut — «SENT BAC», «APPROVE» — an edge that looked like something
 *   to drag and read as a fault. The chosen stage is on the address
 *   (`?stage=`), written by the board itself without a round trip, so a card
 *   opened from it and closed again comes back to the same column.
 * - **A desk scrolls sideways with a sliver of the next column always showing**
 *   when they do not all fit. At 1366 two of the quotation board's six columns
 *   sat past the edge with nothing to say they existed; now the columns are
 *   sized to the room — as many whole ones as fit at their least width, and
 *   three rem of the next — so the edge itself is the sign. A hover arrow
 *   would have been the sign only for a pointer that happened to be there
 *   (NN/g). In Arabic the sliver is at the inline end, which is the left.
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

/** The address word for the column a phone shows. */
const STAGE = "stage";

/**
 * The column a phone opens on when the address names none: the one holding
 * the record whose drawer is open, so the drawer and the board behind it agree;
 * otherwise the first column with anything in it, so a board never opens on an
 * empty column while another has work; otherwise the first.
 */
function openingStage(columns: BoardColumn[]): string | undefined {
  return (
    columns.find((column) => column.cards.some((card) => card.current))?.key ??
    columns.find((column) => (column.total ?? column.cards.length) > 0)?.key ??
    columns[0]?.key
  );
}

/** A card's own address, carrying the chosen stage so closing its drawer comes back to it. */
function withStage(href: string, stage: string): string {
  const [path, query = ""] = href.split("?");
  const params = new URLSearchParams(query);
  params.set(STAGE, stage);
  return `${path}?${params.toString()}`;
}

export function Board({ columns }: { columns: BoardColumn[] }) {
  const t = useTranslations();
  const locale = useLocale();
  const params = useSearchParams();
  const id = useId();
  // A card somebody else just moved takes the arrived flash where it landed,
  // as its row does on the list (D105): the list beside it always had it, and
  // the board — the view read for what moved — did not. The set is the live
  // provider's; the screen's own list already reports when its rows land.
  const arrived = useArrivedIds(columns);

  const asked = params.get(STAGE);
  const named = columns.some((column) => column.key === asked) ? asked : null;
  const chosen = named ?? openingStage(columns);

  // `history.replaceState`, which Next's router hears (useSearchParams follows
  // it) without asking the server for the page again: choosing a column changes
  // what a phone shows, not what the board holds, and a tap that waited on a
  // round trip would be a tap that felt broken. Replace, not push — Back leaves
  // the board rather than walking through every column somebody looked at.
  function choose(key: string) {
    const next = new URLSearchParams(window.location.search);
    next.set(STAGE, key);
    window.history.replaceState(null, "", `${window.location.pathname}?${next.toString()}`);
  }

  // A tablist moves by arrows (lists-navigation.md): along the line in the
  // reader's direction, Home and End to its ends, and the choice follows focus
  // because choosing costs nothing.
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const keys = columns.map((column) => column.key);
    const at = Math.max(0, keys.indexOf(chosen ?? ""));
    const back = getComputedStyle(event.currentTarget).direction === "rtl" ? "ArrowRight" : "ArrowLeft";
    const on = back === "ArrowLeft" ? "ArrowRight" : "ArrowLeft";
    let to: number;
    if (event.key === on) to = (at + 1) % keys.length;
    else if (event.key === back) to = (at - 1 + keys.length) % keys.length;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = keys.length - 1;
    else return;
    event.preventDefault();
    choose(keys[to]);
    event.currentTarget.querySelector<HTMLElement>(`[data-stage="${keys[to]}"]`)?.focus();
  }

  const tabId = (key: string) => `${id}-tab-${key}`;
  const columnId = (key: string) => `${id}-column-${key}`;

  return (
    <div className="flex flex-col gap-2">
      {/* The picker, on a phone only. One line in the columns' own order, from
          the inline start in both languages, scrolling with a fade when six
          names do not fit across 375 pixels. */}
      <div className="md:hidden">
        <ScrollLine
          track={{
            role: "tablist",
            "aria-label": t("common.status"),
            onKeyDown,
          }}
        >
          {columns.map((column) => {
            const count = column.total ?? column.cards.length;
            const active = column.key === chosen;
            return (
              <button
                key={column.key}
                type="button"
                role="tab"
                id={tabId(column.key)}
                data-stage={column.key}
                aria-selected={active}
                aria-controls={columnId(column.key)}
                tabIndex={active ? 0 : -1}
                onClick={() => choose(column.key)}
                className={cn(
                  chipClass({ active }),
                  "touch inline-flex items-center gap-2 whitespace-nowrap outline-none transition-[color,background-color,border-color,box-shadow] duration-100 ease-out focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn("size-1.5 shrink-0 rounded-full", TONE_DOT[column.tone])}
                />
                <span>{column.label}</span>
                <span dir="ltr" className="num text-muted-foreground">
                  {count}
                </span>
              </button>
            );
          })}
        </ScrollLine>
      </div>

      {/* The container the desk's columns are sized against (below). */}
      <div className="@container/board">
        {/* One horizontal scroller, never the page: a board that widens the
            document takes the whole app's layout with it (DESIGN §2). Its
            scrollbar is at the top, where the reader is, not under the longest
            column (StickyScroll, P13 13.3); the scroller contains its
            overscroll, so swiping past the last column on a phone does not
            become the browser's back gesture. */}
        <StickyScroll label={t("common.viewBoard")}>
          <div
            data-slot="board"
            className={cn(
              "flex snap-x gap-3 px-1 pt-2 pb-2",
              // How many whole columns fit at their least width (14.5rem) with
              // the gap (0.75rem) after each and the sliver (3rem) plus the
              // start gutter (0.25rem) left over: k columns need k × 15.25 +
              // 3.25 rem. Each threshold below is that sum.
              "[--fit:1] @min-[33.75rem]/board:[--fit:2] @min-[49rem]/board:[--fit:3] @min-[64.25rem]/board:[--fit:4] @min-[79.5rem]/board:[--fit:5] @min-[94.75rem]/board:[--fit:6] @min-[110rem]/board:[--fit:7]",
              // And the width that makes k columns and the sliver exactly fill
              // the room. Every column starts from it and grows, so a board
              // whose columns all fit fills the width with no sliver and no
              // scroll, and one whose columns do not shows k and the edge of
              // the next.
              "[--lane:calc((100cqi_-_3.25rem_-_var(--fit)_*_0.75rem)_/_var(--fit))]",
            )}
          >
            {columns.map((column) => {
              const count = column.total ?? column.cards.length;
              const shown = column.key === chosen;
              return (
                <section
                  key={column.key}
                  id={columnId(column.key)}
                  aria-label={`${column.label} (${count})`}
                  data-column={column.key}
                  className={cn(
                    "flex min-w-0 shrink-0 grow basis-(--lane) snap-start flex-col gap-2",
                    // A phone: the chosen column, the whole width; the rest
                    // are not drawn, and the picker says they are there.
                    shown ? "max-md:basis-full" : "max-md:hidden",
                  )}
                >
                  {/* On a phone the picker above is this column's heading, word
                      and count, so the header is left to a screen reader rather
                      than said twice a finger's width apart. */}
                  <header className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2 max-md:sr-only">
                    {/* A word in a sentence's case, not an eyebrow (DESIGN §8):
                        no capitals, no tracking, the muted caption. The column's
                        tone is a dot before the word that names it. */}
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        aria-hidden="true"
                        className={cn("size-1.5 shrink-0 rounded-full", TONE_DOT[column.tone])}
                      />
                      <h3 className="text-xs text-muted-foreground">{column.label}</h3>
                    </span>
                    <span dir="ltr" className="num text-xs text-faint">
                      {count}
                    </span>
                  </header>

                  {column.cards.length === 0 ? (
                    <Empty size="panel">{t("common.boardEmpty")}</Empty>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {column.cards.map((card) => (
                        <li key={card.id}>
                          <BoardCardLink
                            card={card}
                            href={named ? withStage(card.href, named) : card.href}
                            arrived={arrived.has(card.id)}
                            locale={locale}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        </StickyScroll>
      </div>
    </div>
  );
}

function BoardCardLink({
  card,
  href,
  arrived,
  locale,
}: {
  card: BoardCard;
  href: string;
  arrived: boolean;
  locale: string;
}) {
  return (
    <Link
      href={href}
      aria-current={card.current ? "true" : undefined}
      className={cn(
        "card-face hover-tint flex flex-col gap-1 p-3",
        card.current && "bg-surface-2",
        arrived && "row-arrived",
      )}
    >
      <span className="flex items-baseline justify-between gap-2">
        {card.label ? (
          <span className="flex items-center gap-2">
            <Ref className="text-sm font-medium">{card.label}</Ref>
            <LinkPending />
          </span>
        ) : (
          // No number: the name leads, as a list row's does.
          <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
            <Clip data-slot="card-title" text={card.title} />
            <LinkPending />
          </span>
        )}
        <Sqm value={card.sqm} className="shrink-0 text-xs" />
      </span>
      {card.label ? (
        <Clip text={card.title} column className="text-sm" />
      ) : null}
      {card.subtitle ? (
        <Clip text={card.subtitle} column className="text-xs text-muted-foreground" />
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
