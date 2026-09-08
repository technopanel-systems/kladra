import type { ReactNode } from "react";
import { TONE_BAR, type StateTone } from "@/lib/state-tone";
import { cn } from "@/lib/utils";

export type ShareRow = {
  /** Stable across a re-sort, so a row keeps its identity (D152). */
  key: string;
  label: ReactNode;
  /** The figure itself, in the app's own figure face. */
  figure: ReactNode;
  /** What the figure is made of, quietly: "on 11 projects". */
  support?: ReactNode;
  /** 0–100. The caller works it out, because only it knows the whole. */
  share: number;
  /**
   * One row's own tone, for the one card whose rows mean different things: a
   * funnel's endings are not five parts of one colour, they are waiting, sent
   * back, withdrawn, accepted and rejected (D62).
   */
  tone?: StateTone;
  /**
   * What this row is, for a spec that has to name it — `{"data-stage": "returned"}`.
   * The rendered row carries no id and no code (DESIGN §2), so the attribute is
   * the only handle a test has on which row is which.
   */
  data?: Record<string, string>;
};

/**
 * A share, drawn as ranked bars (D150).
 *
 * The founder asked for pie or ring charts where a share is the point. This is
 * that request, in the shape that answers it: the eye cannot compare angles,
 * and the question here has ten segments where a pie is a legend and a
 * guessing game. Bars sorted longest first are read in one pass, in order, with
 * the figure written on every row — so nothing has to be measured off the
 * picture at all, which is the same reason the six-month bars carry their own
 * numbers.
 *
 * It is the only drawing of a share in the app. Three cards had their own —
 * the funnel, the losses, and this — and the three had already drifted: two
 * spacings between rows, two gaps between a figure and its caption, and one of
 * them tinting the bar per row while the others did not. A share bar is one
 * object, not one per screen (DESIGN §3, D145), so the two older cards pass
 * their rows through this and keep only what is genuinely theirs: the funnel's
 * per-row tone, which is on the row, and the words, which are the caller's.
 *
 * NOT the month card's bar, which stays its own thing: that one measures how
 * far through a target a month has got and carries a marker for how far through
 * the month itself is (D61). A share of a whole and progress against a target
 * are two questions, and one component answering both would be the drift this
 * one exists to end, from the other side.
 *
 * The bar carries no meaning of its own. Length is the whole message and the
 * figure beside it says the same thing in words, so it is hidden from readers
 * rather than given a role: there is nothing in the picture that is not in the
 * text (D65's rule, said about the months).
 */
export function ShareBars({
  rows,
  tone = "over",
}: {
  rows: ShareRow[];
  /** One tone for every bar: length is the comparison, not colour. */
  tone?: keyof typeof TONE_BAR;
}) {
  return (
    <ol className="flex flex-col gap-3">
      {rows.map((row) => (
        <li
          key={row.key}
          data-slot="share-row"
          {...row.data}
          className="flex flex-col gap-1.5"
        >
          <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
            <span className="min-w-0">{row.label}</span>
            <span className="flex items-baseline gap-2">
              {row.figure}
              {row.support ? (
                <span className="text-xs text-muted-foreground">{row.support}</span>
              ) : null}
            </span>
          </span>

          <span aria-hidden="true" className="h-1.5 w-full rounded-full bg-surface-2">
            <span
              style={{ inlineSize: `${Math.max(0, Math.min(100, row.share))}%` }}
              className={cn("block h-full rounded-full", TONE_BAR[row.tone ?? tone])}
            />
          </span>
        </li>
      ))}
    </ol>
  );
}
