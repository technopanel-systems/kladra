import type { ReactNode } from "react";
import { ScrollLine } from "@/components/ui-ext/sticky-scroll";

/**
 * The chips over a list, and whatever changes the list's shape in front of them
 * (D145).
 *
 * It was written four times and the four disagreed about one thing: what
 * happens when the row runs out of width. On the quotations list at 375 the
 * list/board switch, the four status chips and «All» were one wrapping row, so
 * «All» came round underneath behind a divider and read as a second group of
 * one — three groups on a screen with room for two, and the wrong one broken.
 *
 * The rule, in one place: what changes the SHAPE of a list is not one of the
 * filters that change what is IN it, and below the phone line it takes its own
 * row (D128). The divider in front of the chips is a mark on a line, so it is
 * drawn only where there is a line to mark and only when there is something to
 * separate.
 *
 * **And the chips are one line, at every width** (P13-G6). The group used to
 * wrap, so the admin's eleven lookups stood in two lines at 1366 and four at
 * 375 — a wall, and the list under it pushed off a phone's first screen. They
 * are a `ScrollLine` now: one line in the order they were given, which scrolls
 * sideways when it has to and fades at the edge that has more.
 *
 * «All» is the FIRST chip (SPEC §3 P13): "Nobody should be able to forget a
 * company because the default hid it." It sat last, after a divider, as "the
 * absence of a filter" — which put the one choice that shows everything at the
 * far end of the row from where the eye starts, in both directions. First, it
 * is the choice a screen opens on and the one a reader finds without looking;
 * the divider after it keeps it a peer of the filters rather than one of them.
 */
export function FilterRow({
  lead,
  children,
  all,
}: {
  /** What changes the list's shape — the list/board switch. Its own row on a phone. */
  lead?: ReactNode;
  /** The chips. Null on a view they do not belong to, which hides their group. */
  children?: ReactNode;
  /** "All", which is the absence of a filter: first, and before a divider. */
  all?: ReactNode;
}) {
  return (
    <div
      data-slot="filter-row"
      className="flex flex-col items-start gap-2 md:flex-row md:items-center"
    >
      {lead ? (
        <div data-slot="filter-lead" className="flex shrink-0 items-center gap-2">
          {lead}
          {children ? (
            <span aria-hidden="true" className="hidden h-4 w-px bg-line md:inline-block" />
          ) : null}
        </div>
      ) : null}

      {children ? (
        // Stretched on a phone, where the row is a column; the rest of the
        // line at a desk. `min-w-0` so the line can be narrower than its chips,
        // which is what lets it scroll rather than widen the page.
        <ScrollLine className="min-w-0 self-stretch md:flex-1 md:self-auto">
          {all ? (
            <>
              {all}
              <span aria-hidden="true" className="h-4 w-px shrink-0 bg-line" />
            </>
          ) : null}
          {children}
        </ScrollLine>
      ) : null}
    </div>
  );
}
