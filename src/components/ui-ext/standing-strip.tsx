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
 * Two to four items. More than four and it stops being a glance, and on a phone
 * they wrap to two rows rather than shrink to nothing.
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
const COLUMNS: Record<1 | 2 | 3 | 4, string> = {
  1: "sm:grid-cols-1",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-4",
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
        COLUMNS[Math.min(items.length, 4) as 1 | 2 | 3 | 4],
        className,
      )}
    >
      {items.map((item, index) => (
        // The index, not the label: two figures may legitimately share a word,
        // and a duplicate key silently drops one of them.
        <div key={index} className="flex min-w-0 flex-col gap-0.5">
          <dt
            data-slot="figure-label"
            className="text-[0.6875rem] leading-tight font-medium tracking-wide text-balance text-muted-foreground uppercase"
          >
            {item.label}
          </dt>
          <dd className={cn("truncate text-sm leading-tight", item.tone && TONE_TEXT[item.tone])}>
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
