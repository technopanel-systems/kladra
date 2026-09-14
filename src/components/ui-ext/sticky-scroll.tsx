"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
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
 * Nothing is drawn when nothing overflows — a phone showing one column at a
 * time still overflows, and gets the bar; a desk wide enough for every column
 * does not, and gets nothing.
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
