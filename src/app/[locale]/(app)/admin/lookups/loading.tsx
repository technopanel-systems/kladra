import { Skeleton } from "@/components/ui/skeleton";

/**
 * A list of lookups while it reads (DESIGN §1b: the shape, standing still). The
 * heading with Add at its end, the row of lists to choose from, and one card of
 * 40px rows — a name, and Edit with the row's menu at the end.
 */
export default function LookupsLoading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" role="status">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-8 w-20 rounded-lg" />
      </div>

      <div className="flex gap-2">
        {[0, 1, 2, 3].map((chip) => (
          <Skeleton key={chip} className="h-8 w-28 rounded-full" />
        ))}
      </div>

      <div className="card-face flex flex-col">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((row) => (
          <div
            key={row}
            className="flex h-13 items-center gap-3 border-b border-line px-3 last:border-0 md:h-10 md:px-4"
          >
            <Skeleton className="h-4 w-48 max-w-full" />
            <span className="ms-auto flex items-center gap-2">
              <Skeleton className="h-6 w-12 rounded-lg" />
              <Skeleton className="size-6 rounded-lg" />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
