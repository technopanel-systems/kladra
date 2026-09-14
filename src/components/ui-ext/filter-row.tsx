import type { ReactNode } from "react";

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
      className="flex flex-col items-start gap-2 md:flex-row md:flex-wrap md:items-center"
    >
      {lead ? (
        <div data-slot="filter-lead" className="flex items-center gap-2">
          {lead}
          {children ? (
            <span aria-hidden="true" className="hidden h-4 w-px bg-line md:inline-block" />
          ) : null}
        </div>
      ) : null}

      {children ? (
        <div className="flex flex-wrap items-center gap-2">
          {all ? (
            <>
              {all}
              <span aria-hidden="true" className="h-4 w-px bg-line" />
            </>
          ) : null}
          {children}
        </div>
      ) : null}
    </div>
  );
}
