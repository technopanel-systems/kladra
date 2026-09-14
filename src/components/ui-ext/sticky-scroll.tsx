"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

/**
 * A surface wider than the screen, with its scrollbar where the reader is
 * (DESIGN §1b, P13 13.3).
 *
 * A board of five columns or a table of nine scrolls sideways inside itself,
 * and the browser draws that scrollbar at the BOTTOM of the surface — which on a
 * board of forty cards is two screens below the column somebody is looking for,
 * and on Windows with overlay scrollbars is not drawn at all until the pointer
 * finds it. So nobody knew the board went on past the fourth column.
 *
 * The bar here is a proxy: a thin, empty scroller pinned to the top of the
 * surface with `position: sticky`, as wide inside as the surface is, and synced
 * both ways. The surface's own bar is hidden while the proxy stands in for it;
 * wheel, trackpad, touch and the keyboard still scroll the surface itself.
 *
 * Direction needs no arithmetic. Both scrollers inherit the document's `dir`, so
 * in Arabic both start at the inline start and both count `scrollLeft` from 0
 * the same way, whatever sign the browser uses for it; copying the number from
 * one to the other is correct in either direction. What WOULD break is giving
 * the proxy a `dir` of its own.
 *
 * Nothing is drawn when nothing overflows — a wide table on a narrow window
 * gets the bar; a desk wide enough for every column, and a phone board showing
 * its one chosen column (board.tsx), get nothing.
 *
 * **It takes no room (P13-S7 review).** Whether the surface overflows is known
 * only once it has been measured in the browser, so the bar appears after the
 * first paint — and when it was a block of its own, everything under it (the
 * whole table, the whole board) moved down by its height the moment it did, on
 * every visit. So the sticky element is a shelf of no height and the bar hangs
 * from it, laid over the surface's top edge: appearing moves nothing, and the
 * space it covers is the header row's padding or the board's top gutter.
 *
 * **Where it sticks.** `sticky` sticks inside the nearest ancestor that SCROLLS —
 * `overflow: hidden` makes one, `clip` does not — so the same `top` can mean two
 * different things:
 *
 * - When the page is what scrolls, the bar has to stop under the app's sticky top
 *   bar (`top-bar.tsx`: 3.5rem and its 1px border). At `top: 0` it slid behind
 *   the header and was on screen only in the sense that it was painted there.
 * - Inside something that scrolls or hides its overflow, that thing is what it
 *   sticks to, and the same 3.5rem pushed the bar 3.5rem DOWN into it, over the
 *   table it belonged to. The kit's card used to be that thing; `card-face`
 *   clips now, for exactly this reason.
 *
 * So the bar is told nothing and finds out: on mount it walks up from the
 * surface, and if nothing between it and the page scrolls or hides, it sits
 * under the top bar; otherwise it sits at the top of whatever holds it. A caller
 * that knows better still says so with `barClassName`. The surface itself clips
 * rather than hides, for the same reason the card does.
 */

/** The top bar's height and its border, which is where a page-scrolled bar stops. */
const UNDER_TOP_BAR = "calc(3.5rem + 1px)";

export function StickyScroll({
  children,
  label,
  className,
  barClassName,
}: {
  children: ReactNode;
  /** What the region is, for a reader moving by landmarks and for the Tab stop. */
  label: string;
  className?: string;
  /** Where the proxy sticks, when the caller knows better than the walk above. */
  barClassName?: string;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const shelfRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [inner, setInner] = useState(0);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const measure = () => {
      setInner(body.scrollWidth);
      setOverflows(body.scrollWidth > body.clientWidth + 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(body);
    for (const child of Array.from(body.children)) observer.observe(child);
    return () => observer.disconnect();
  }, []);

  // Where the shelf stops: under the top bar when the page scrolls it, at the
  // top of its holder when something closer does. Written to the element, not
  // to state — it is decided once and nothing on the screen redraws for it.
  useEffect(() => {
    const shelf = shelfRef.current;
    if (!shelf || barClassName) return;
    let held = false;
    // From the surface's own box up. A clipper is not a scroller, so `clip` is
    // not asked about; a caller's class that hides would be.
    for (let node = shelf.parentElement; node && node !== document.body; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (/auto|scroll|hidden/.test(`${style.overflowX} ${style.overflowY}`)) {
        held = true;
        break;
      }
    }
    shelf.style.insetBlockStart = held ? "0px" : UNDER_TOP_BAR;
  }, [barClassName]);

  useEffect(() => {
    const body = bodyRef.current;
    const bar = barRef.current;
    if (!body || !bar || !overflows) return;
    // Each side copies the other only when they differ by more than a pixel, so
    // the echo of a copy lands on an equal value and stops there instead of
    // bouncing between two sub-pixel positions for ever.
    const follow = (from: HTMLElement, to: HTMLElement) => () => {
      if (Math.abs(to.scrollLeft - from.scrollLeft) > 1) to.scrollLeft = from.scrollLeft;
    };
    const fromBody = follow(body, bar);
    const fromBar = follow(bar, body);
    bar.scrollLeft = body.scrollLeft;
    body.addEventListener("scroll", fromBody, { passive: true });
    bar.addEventListener("scroll", fromBar, { passive: true });
    return () => {
      body.removeEventListener("scroll", fromBody);
      bar.removeEventListener("scroll", fromBar);
    };
  }, [overflows]);

  return (
    <div data-slot="sticky-scroll" className={cn("relative", className, "overflow-clip")}>
      {/* The shelf: sticky, and no height, so showing it moves nothing below. */}
      <div
        ref={shelfRef}
        hidden={!overflows}
        className={cn("sticky top-0 z-10 h-0 bg-inherit", barClassName)}
      >
        <div
          ref={barRef}
          aria-hidden="true"
          data-slot="sticky-scroll-bar"
          className="absolute inset-x-0 top-0 overflow-x-auto overflow-y-hidden bg-inherit [scrollbar-width:thin]"
        >
          <div style={{ inlineSize: inner, blockSize: 1 }} />
        </div>
      </div>
      <div
        ref={bodyRef}
        role="region"
        aria-label={label}
        // A scroller a keyboard cannot reach is a scroller a keyboard cannot use.
        tabIndex={overflows ? 0 : undefined}
        className={cn(
          "overflow-x-auto overscroll-x-contain",
          overflows && "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** How far the fade reaches in from an edge that has more behind it. */
const FADE = "2rem";

/**
 * One line of things wider than its room, which scrolls and says so (P13-G6,
 * D145) — the chips over a list, and a board's stages on a phone.
 *
 * A row of chips that runs out of width has two ways to go, and the kit's
 * `flex-wrap` took the wrong one: the admin's eleven lookups came round onto a
 * second line at 1366 and onto four at 375, a wall of words that pushed the
 * list off the phone's first screen and read as two groups where there was one.
 * A line keeps its order and its one reading; what does not fit is behind the
 * edge, and the edge fades where — and only where — there is more.
 *
 * It is not a `StickyScroll`, and deliberately: that one is for a SURFACE, a
 * board or a table whose scrollbar has to be found forty rows up. A line is one
 * row tall, so its own thin bar is where the reader already is — and on a phone,
 * where a finger swipes it, there is no bar to draw at all.
 *
 * Three details that are each a defect when missed:
 *
 * - **The focus ring.** A scroller clips what spills out of it, and a chip's
 *   ring spills 3px. The line is padded by 4 and pulled back by the same, so
 *   it takes no more room than the chips and cuts none of their rings.
 * - **The fade is measured, not assumed.** The start edge fades only once the
 *   line has been scrolled, the end edge only while something is still behind
 *   it — a line that fits has no fade at all, and one scrolled to its end stops
 *   hinting at more. Distance is taken as an absolute value, so an Arabic line,
 *   whose `scrollLeft` counts the other way, needs no arithmetic of its own; the
 *   gradient turns round with `dir`.
 * - **The chosen thing is on screen.** A reader who opened the eleventh lookup
 *   on a phone found the line at its start and no chip marked. When the chosen
 *   element changes and is not fully in view, the line moves it to the middle —
 *   sideways only, so the page does not jump — and leaves a line the reader
 *   has scrolled himself alone.
 */
export function ScrollLine({
  children,
  className,
  track,
}: {
  children: ReactNode;
  className?: string;
  /**
   * The line itself, where it is one thing a reader moves through — a tablist
   * carries its role and its name here, on the parent of its tabs.
   */
  track?: HTMLAttributes<HTMLDivElement>;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const shownRef = useRef<Element | null>(null);
  const [more, setMore] = useState({ start: false, end: false });

  useEffect(() => {
    const scroller = scrollerRef.current;
    const line = lineRef.current;
    if (!scroller || !line) return;
    const measure = () => {
      const along = Math.abs(scroller.scrollLeft);
      const room = scroller.scrollWidth - scroller.clientWidth;
      const start = along > 1;
      const end = room - along > 1;
      setMore((was) => (was.start === start && was.end === end ? was : { start, end }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    observer.observe(line);
    scroller.addEventListener("scroll", measure, { passive: true });
    return () => {
      observer.disconnect();
      scroller.removeEventListener("scroll", measure);
    };
  }, []);

  // After every render, and cheap: it acts only when the chosen element is a
  // different one from last time and is not already wholly in view.
  useEffect(() => {
    const scroller = scrollerRef.current;
    const chosen = scroller?.querySelector('[aria-current="true"], [aria-selected="true"]') ?? null;
    if (!scroller || !chosen || chosen === shownRef.current) return;
    shownRef.current = chosen;
    const box = scroller.getBoundingClientRect();
    const it = chosen.getBoundingClientRect();
    if (it.left >= box.left && it.right <= box.right) return;
    // The same delta is right in both directions: a larger `scrollLeft` shows
    // what is further right whichever way the line counts.
    scroller.scrollLeft += it.left + it.width / 2 - (box.left + box.width / 2);
  });

  return (
    <div
      ref={scrollerRef}
      data-slot="scroll-line"
      data-more-start={more.start ? "true" : undefined}
      data-more-end={more.end ? "true" : undefined}
      style={
        {
          "--line-fade-start": more.start ? FADE : "0px",
          "--line-fade-end": more.end ? FADE : "0px",
        } as CSSProperties
      }
      // `relative`, which is not decoration: a scroller clips only what it is
      // the containing block of, and each chip carries an absolutely placed
      // live region (LinkPending). Without it those escaped the line, stood
      // off both ends of it, and gave the whole page a sideways scroll — an
      // Arabic phone opened scrolled to its far side and showed nothing.
      className={cn(
        "relative -m-1 overflow-x-auto overflow-y-hidden overscroll-x-contain p-1 scroll-px-8 [scrollbar-width:thin]",
        "[--line-fade-to:to_right] rtl:[--line-fade-to:to_left]",
        "[mask-image:linear-gradient(var(--line-fade-to),transparent,#000_var(--line-fade-start),#000_calc(100%_-_var(--line-fade-end)),transparent)]",
        className,
      )}
    >
      <div
        {...track}
        ref={lineRef}
        data-slot="scroll-line-track"
        className={cn("flex w-max items-center gap-2", track?.className)}
      >
        {children}
      </div>
    </div>
  );
}
