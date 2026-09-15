import { Skeleton } from "@/components/ui/skeleton";

/**
 * The coordinator's desk while it reads (DESIGN §1b: the shape of what it stands
 * in for, standing still), in its own shape rather than the app's generic list
 * (S12.6): the title, the strip of four figures, the one search box, and her
 * two halves side by side from `lg` — a heading and a table of rows each, the
 * rows at the height a quotation's three lines take.
 */
export default function QueueLoading() {
  return (
    <div data-slot="queue-skeleton" className="flex flex-col gap-6" aria-busy="true" role="status">
      <Skeleton className="h-7 w-32" />

      {/* The strip's edge without its fill: a skeleton is drawn in the inset
          panel's own colour, and on that panel the four figures vanished. */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-line p-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((figure) => (
          <div key={figure} className="flex flex-col gap-1.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-12" />
            <Skeleton className="h-3 w-28 max-w-full" />
          </div>
        ))}
      </div>

      <Skeleton className="h-9 w-full max-w-md rounded-lg max-md:h-11" />

      <div className="grid items-start gap-6 lg:grid-cols-2">
        {[3, 4].map((rows, half) => (
          <div key={half} className="flex min-w-0 flex-col gap-3">
            <Skeleton className="h-4 w-28" />
            <div className="card-face flex flex-col divide-y divide-line">
              <div className="flex h-11 items-center px-3">
                <Skeleton className="h-3 w-3/5" />
              </div>
              {Array.from({ length: rows }, (_, row) => (
                <div key={row} className="flex items-center gap-4 px-3 py-4">
                  <Skeleton className="h-4 w-10 shrink-0" />
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                  <Skeleton className="h-4 w-14 shrink-0" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
