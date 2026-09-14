/**
 * What colour a mark on a chart is, from the colours that already mean
 * something (DESIGN §1b: "a chart series takes its colour from that same set").
 *
 * Three answers and no fourth. A state series — where a quotation got to — is in
 * its state tone, so amber on the pie is amber on the board. A per-person
 * series is in that person's avatar tint, so the bar beside a name is the colour
 * of the circle beside the same name on the team tab. Anything else — segments,
 * reasons, sources, cities — has no colour of its own, because "there is no
 * sixth state and no colour for a category": its marks are one neutral ink
 * stepped by RANK, the largest darkest, which says "biggest first" and nothing
 * a reader would have to learn a key for. The words beside every mark say which
 * is which.
 *
 * CSS variables and not hex: both themes are the tokens' business (DESIGN §1),
 * and a chart that hard-coded the dark theme's amber would print it on the light.
 */
import { avatarTint } from "@/lib/avatar";
import type { StateTone } from "@/lib/state-tone";

export type Ink = { fill: string; opacity: number };

/**
 * A state's FOREGROUND, which is what a shape takes — never the pill's tint.
 * `TONE_CLASS` is a tint behind text, nine to fourteen per cent alpha, and
 * `over`'s tint is `--surface-2` exactly, the colour of an empty track: the
 * withdrawn bar on the chain card was once painted in the track it sat in and
 * could not be seen at all. (This map replaced the bar classes that said so,
 * when the bars became the chart kit's in P13-S9.)
 */
const TONE_INK: Record<StateTone, string> = {
  wait: "var(--a-amber-fg)",
  open: "var(--a-blue-fg)",
  good: "var(--a-green-fg)",
  bad: "var(--a-red-fg)",
  over: "var(--text-muted)",
};

export function toneInk(tone: StateTone): Ink {
  return { fill: TONE_INK[tone], opacity: 1 };
}

/** One person, one colour, on every screen (DESIGN §1b). */
export function personInk(id: string): Ink {
  return { fill: `var(--avatar-${avatarTint(id)}-fg)`, opacity: 1 };
}

/** Six steps, the most a pie may have (DESIGN §1b), the last for "the rest". */
const RANK_OPACITY = [0.9, 0.7, 0.54, 0.42, 0.32, 0.2];

/** The n-th largest of something that has no colour of its own. */
export function rankInk(index: number): Ink {
  return { fill: "var(--text)", opacity: RANK_OPACITY[Math.min(index, RANK_OPACITY.length - 1)] };
}

/** The part of a whole that is not the part — the ring's empty track. */
export const TRACK_INK: Ink = { fill: "var(--surface-2)", opacity: 1 };
