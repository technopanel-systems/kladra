import type { ReactNode } from "react";
import { TONE_TEXT, type StateTone } from "@/lib/state-tone";
import { cn } from "@/lib/utils";

/**
 * The band of figures under a drawer's title: how this thing is standing
 * (DESIGN §6, P8.5).
 *
 * Jerom's word for the old panels was "thin". They opened on a flat list of
 * fields — city, category, lead source, rep — which is what the record HAS, not
 * how it is GOING. This is the answer to the second question, and it comes
 * first because it is the one a person opened the drawer to ask.
 *
 * Two to five items. Four was the limit until the manager's strip needed a
 * fifth (D83); five fit across a desk, and below `lg` they take three rows of
 * two — a fifth tile alone in the left quarter of a second row was the same
 * "failed to load" defect the column count below exists to prevent. More than
 * five and it stops being a glance.
 *
 * Each item may carry a CAPTION, and that is Jerom's phase-9C rule made into a
 * slot rather than a habit: every number must answer a question somebody asks
 * daily, and the screen must say what the number means in words beside it. A
 * caption is not a definition of the figure — "the number of quotations" is a
 * tooltip and nobody reads it twice. It is the reading: what it is measured
 * against, or what part of it somebody has to do something about. "3" answers
 * nothing on its own; "3" with "1 waiting more than 2 working days" is a
 * morning's work in two lines.
 *
 * The label wraps; the figure does not. Four columns inside a drawer are narrow
 * enough that the longest English label — OPEN QUOTATIONS — was clipped to
 * "OPEN QUOTATIO…", which says less than nothing. Two short lines of label above
 * a whole figure is the right way round: the figure is what the eye came for.
 */
/** Written out, because Tailwind reads class names and not expressions. */
const COLUMNS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "sm:grid-cols-1",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-4",
  // Two columns up to `lg`, so the odd fifth spans the row below it.
  5: "lg:grid-cols-5",
};

export function StandingStrip({
  items,
  className,
}: {
  items: {
    label: string;
    value: ReactNode;
    /** What the figure means, in words. One short line, never a definition. */
    caption?: ReactNode;
    tone?: StateTone | null;
  }[];
  className?: string;
}) {
  return (
    <dl
      data-slot="standing"
      className={cn(
        "grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-line bg-surface-2 px-3 py-2.5",
        // As many columns as there are figures, up to four. It was always four,
        // so a strip of two sat in the left half of a full-width card with the
        // right half bare — which reads as two tiles that failed to load rather
        // than as a strip with two figures on it.
        COLUMNS[Math.min(items.length, 5) as 1 | 2 | 3 | 4 | 5],
        className,
      )}
    >
      {items.map((item, index) => (
        // The index, not the label: two figures may legitimately share a word,
        // and a duplicate key silently drops one of them.
        <div
          key={index}
          className={cn(
            "flex min-w-0 flex-col gap-0.5",
            // An odd figure last on a two-column phone grid leaves the cell
            // beside it empty, which reads as a tile that failed to load rather
            // than as a strip with three figures on it — the same defect the
            // column count above fixes one width up. It takes the whole row
            // instead, and above `sm:` the grid has a column per figure and
            // nothing to span.
            items.length % 2 === 1 &&
              index === items.length - 1 &&
              (items.length === 5 ? "col-span-2 lg:col-span-1" : "col-span-2 sm:col-span-1"),
          )}
        >
          <dt
            data-slot="figure-label"
            className="text-[0.6875rem] leading-tight font-medium tracking-wide text-balance text-muted-foreground uppercase"
          >
            {item.label}
          </dt>
          {/* Wraps too, and for a harder reason than the caption below it: a
              SENTENCE that truncates says something else, and a FIGURE that
              truncates IS something else. «31/أغسطس/2026» in a 103px cell read
              "31/أغسطس/6…" on the quotation drawer at 375 — a date that does not
              exist, printed with no sign that anything had been cut (§5 #165).
              An Arabic month name is wider than "Aug" and nothing in a grid
              cell's width knows that. */}
          <dd
            className={cn("text-sm leading-tight break-words", item.tone && TONE_TEXT[item.tone])}
          >
            {item.value}
          </dd>
          {/* Wraps, because a sentence that truncates says something else. */}
          {item.caption ? (
            <dd
              data-slot="figure-caption"
              className="text-xs leading-snug text-balance text-muted-foreground"
            >
              {item.caption}
            </dd>
          ) : null}
        </div>
      ))}
    </dl>
  );
}
