import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Today's cards: the one grid a work tab lays them in (SPEC §3 P13, DESIGN §1b).
 *
 * `repeat(auto-fit, minmax(18rem, 1fr))` — as many across as fit, so at 1366 a
 * day with three things on it is one row of three and at 375 every card is the
 * width of the phone, one under the other, in the order the work should be done.
 * `items-start`, because a card ends where its content ends: stretched to the
 * height of a long neighbour, a two-row card drew a block of nothing under its
 * rows, which reads as a card that failed to load rather than a short answer.
 * No `grid-flow-dense` — it reorders what the Tab key and a screen reader walk,
 * and this app is read in two directions.
 *
 * The rows inside a card run edge to edge (`WORK_ROWS`), so the hover tint on a
 * row reaches the card's own edge and the hairline between rows is the card's.
 *
 * The manager's work tab and the day both draw from here — one grid, one card,
 * one row, rather than two screens that each decided their own paddings.
 */
export function WorkGrid({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="work-grid"
      className={cn("grid grid-cols-[repeat(auto-fit,minmax(18rem,1fr))] items-start gap-6", className)}
      {...props}
    />
  );
}

/** A card on a work tab: the surface at rest, 12px on a phone and 16px on a desk. */
export const WORK_CARD = "card-face flex min-w-0 flex-col gap-3 p-3 md:p-4";

/** The list inside a card, bled to its edges, a hairline between rows. */
export const WORK_ROWS = "-mx-3 flex flex-col divide-y divide-line border-t border-line md:-mx-4";

/** One row of that list, padded back to the card's own inset. */
export const WORK_ROW = "px-3 py-3 md:px-4";
