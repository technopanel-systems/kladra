"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * The three charts, each downloaded by the screen that draws one.
 *
 * Recharts is the heaviest thing a browser fetches from Kladra — 110 KB
 * gzipped — and it went to every page that could draw a chart, not every page
 * that did: a rep's home is one route with two tabs, the metrics tab has
 * charts, and the work tab he opens every morning downloaded them too (P14.5,
 * measured against the production build). Behind `next/dynamic` the chart is
 * still rendered with the page on the server; its code is fetched only where
 * one is on the screen.
 *
 * A client module, and it has to be. Written as a server module the same three
 * lines changed nothing — the page's entry still carried recharts, because a
 * server component's imports are bundled into the page whether it renders them
 * or not. Here the import is a real chunk boundary in the browser's graph.
 *
 * Each has a placeholder, and the placeholder is what makes this safe rather
 * than what makes it pretty. Rendered on the server with no `loading`, a lazy
 * component gets no loading boundary of its own, so it held back the WHOLE
 * metrics section from coming alive until the chart code arrived — the rep
 * picker and the window's chips included. A press on the picker in that gap
 * did nothing (metrics.spec, in Arabic, where the gap was widest). With a
 * placeholder each chart waits alone. It is drawn only when a chart is shown
 * without its code, which is after moving tabs; on a page load the server's
 * chart stays on screen until its code arrives. Shaped like the tab's skeleton
 * (work-skeleton.tsx), which is shaped like the charts.
 *
 * Import a chart from here and its types from its own file.
 */

function ColumnsPlaceholder() {
  return (
    <div className="flex h-36 items-end justify-around gap-4" aria-hidden="true">
      {["h-16", "h-20", "h-20", "h-24", "h-28", "h-12"].map((height, column) => (
        <Skeleton key={column} className={cn("w-8 rounded-md", height)} />
      ))}
    </div>
  );
}

function RingPlaceholder() {
  return (
    <div className="flex items-center gap-3 p-2" aria-hidden="true">
      <Skeleton className="size-20 shrink-0 rounded-full" />
      <Skeleton className="h-4 w-32" />
    </div>
  );
}

function PiePlaceholder() {
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start" aria-hidden="true">
      <Skeleton className="size-46 max-w-full shrink-0 rounded-full" />
      <div className="flex w-full min-w-0 flex-col gap-3">
        {[0, 1, 2, 3].map((line) => (
          <Skeleton key={line} className="h-4 w-full" />
        ))}
      </div>
    </div>
  );
}

export const BarsChart = dynamic(
  () => import("@/components/metrics/bars-chart").then((chart) => chart.BarsChart),
  { loading: ColumnsPlaceholder },
);
export const ProgressRing = dynamic(
  () => import("@/components/metrics/progress-ring").then((chart) => chart.ProgressRing),
  { loading: RingPlaceholder },
);
export const SharePie = dynamic(
  () => import("@/components/metrics/share-pie").then((chart) => chart.SharePie),
  { loading: PiePlaceholder },
);
