import type { ReactNode } from "react";
import { TONE_DOT, type StateTone } from "@/lib/state-tone";
import { cn } from "@/lib/utils";

/**
 * Today's cards: the one layout a work tab lays them in (SPEC §3 P13, DESIGN §1b).
 *
 * **Two stacks, not a grid of peers** (P13-G6 S12.6). The work tabs were a
 * `repeat(auto-fit, minmax(18rem, 1fr))` grid, and a work tab is the one
 * dashboard whose cards are lists of any length: the rep's "Waiting on you" ran
 * five rows beside a two-row "Overdue" and a one-row "Due today", and the next
 * card started under the tallest, so two thirds of a desk stood empty under the
 * short ones. Stretched, the short ones drew the same emptiness inside
 * themselves (D154). Neither reads as a short answer; both read as a card that
 * failed to load.
 *
 * So a work tab is two columns from `lg`, and each is a stack: a card ends
 * where its content ends and the next card in the same column starts under it.
 * The split is contiguous and in reading order — the first stack holds the first
 * cards, the second the rest — so the Tab key, a screen reader and a phone (one
 * column below `lg`) all walk them in the order the work should be done, and
 * nothing is packed out of place (`grid-flow-dense` and CSS masonry stay refused,
 * §4). Where the split falls is the caller's: the day splits by question (what
 * came back, who to call), the stuck list by length (`splitByLength`).
 *
 * One stack with nothing in it is not a column: the other takes the width,
 * rather than one card beside a half-desk of nothing.
 *
 * The rows inside a card run edge to edge (`WORK_ROWS`), so the hover tint on a
 * row reaches the card's own edge and the hairline between rows is the card's.
 *
 * The manager's work tab and the day both draw from here — one layout, one
 * card, one row, rather than two screens that each decided their own paddings.
 */
export function WorkGrid({
  start,
  end,
  className,
}: {
  /** The first stack: the first cards in reading order. */
  start: ReactNode;
  /** The second stack, beside it on a desk and under it on a phone. */
  end: ReactNode;
  className?: string;
}) {
  const both = hasContent(start) && hasContent(end);
  return (
    <div
      data-slot="work-grid"
      className={cn("grid items-start gap-6", both && "lg:grid-cols-2", className)}
    >
      {hasContent(start) ? <div className={STACK}>{start}</div> : null}
      {hasContent(end) ? <div className={STACK}>{end}</div> : null}
    </div>
  );
}

const STACK = "flex min-w-0 flex-col gap-6";

function hasContent(node: ReactNode): boolean {
  if (Array.isArray(node)) return node.some(hasContent);
  return node !== null && node !== undefined && node !== false;
}

/**
 * Where a run of cards splits into two stacks of about the same height, without
 * moving any of them out of order: the index of the first card of the second
 * stack. `weights` are each card's length in rows, which is what its height is
 * made of; the split is the one that leaves the two totals closest, and on a tie
 * the earlier one, so the first stack is never the shorter by choice.
 */
export function splitByLength(weights: number[]): number {
  if (weights.length < 2) return weights.length;
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let best = 1;
  let bestGap = Number.POSITIVE_INFINITY;
  let before = 0;
  for (let index = 1; index < weights.length; index += 1) {
    before += weights[index - 1];
    const gap = Math.abs(total - 2 * before);
    if (gap < bestGap) {
      best = index;
      bestGap = gap;
    }
  }
  return best;
}

/** A card on a work tab: the surface at rest, 12px on a phone and 16px on a desk. */
export const WORK_CARD = "card-face flex min-w-0 flex-col gap-3 p-3 md:p-4";

/** The list inside a card, bled to its edges, a hairline between rows. */
export const WORK_ROWS = "-mx-3 flex flex-col divide-y divide-line border-t border-line md:-mx-4";

/** One row of that list, padded back to the card's own inset. */
export const WORK_ROW = "px-3 py-3 md:px-4";

/**
 * The actions under a row's words, lined up with the words rather than with the
 * avatar: a 24px face and the 12px gap beside it (`ps-9`). One place on every
 * card, so a recurring control sits where the eye already found it on the card
 * beside (S12.6).
 */
export const WORK_ROW_ACTIONS = "relative z-10 flex flex-wrap items-center gap-2 ps-9";

/**
 * A card's title: the words in the text colour and, where the card is a state,
 * that state's dot before them — a title is never coloured by its tone
 * (restyle, DESIGN §1). The count after it is the uncapped figure (D144), a
 * step quieter than the words, and inside the heading so a reader moving by
 * headings hears how many.
 *
 * The dot is 8px, the size of the state dot on a row's 24px face, so the
 * title's caption lines up under the words with the scale's own `ps-4` (the dot
 * and its 8px gap).
 */
export function WorkTitle({
  as: Heading = "h3",
  tone,
  count,
  id,
  children,
}: {
  as?: "h2" | "h3";
  tone?: StateTone | null;
  count?: number;
  id?: string;
  children: ReactNode;
}) {
  return (
    <Heading id={id} className="flex items-center gap-2 text-sm font-medium text-foreground">
      {tone ? (
        <span
          aria-hidden="true"
          data-slot="title-dot"
          data-tone-dot={tone}
          className={cn("size-2 shrink-0 rounded-full", TONE_DOT[tone])}
        />
      ) : null}
      <span className="min-w-0">
        {children}
        {count === undefined ? null : (
          <>
            {" "}
            <span dir="ltr" className="num font-normal text-muted-foreground">
              {count}
            </span>
          </>
        )}
      </span>
    </Heading>
  );
}
