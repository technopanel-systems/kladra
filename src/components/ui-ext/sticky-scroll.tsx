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
 */
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
  /** Where the proxy sticks — below a sticky header, say. Defaults to `top-0`. */
  barClassName?: string;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
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
    <div data-slot="sticky-scroll" className={cn("relative", className)}>
      <div
        ref={barRef}
        aria-hidden="true"
        data-slot="sticky-scroll-bar"
        hidden={!overflows}
        className={cn(
          "sticky top-0 z-10 overflow-x-auto overflow-y-hidden [scrollbar-width:thin]",
          barClassName,
        )}
      >
        <div style={{ inlineSize: inner, blockSize: 1 }} />
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
